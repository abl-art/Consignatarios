'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendPurchaseWebhook, buildTimestamp, type PurchaseLine, type PurchasePayload } from '@/lib/gocelular-webhook'
import { parseImeiExcel } from '@/lib/imei-excel-parser'
import { validarCompra, verificarAliasVsPedido, type CatalogoGocelular } from '@/lib/purchase-validation'
import { plataformaDePedido, armarLineasGomarket, validarSkusCommerce, type SkuCommerce } from '@/lib/gomarket-purchase'
import { sendCommercePurchaseWebhook, type CommercePurchasePayload } from '@/lib/gomarket-webhook'
import type { Pedido, GocelularEstado } from '@/lib/actions/compras'

type PedidoItem = Pedido['items'][number]

// Best-effort por-instancia: evita que dos disparos concurrentes del mismo pedido (ej. un
// click en el boton + el auto-disparo de subirImeiPedido casi simultaneo) manden el webhook
// dos veces. No es un lock distribuido entre instancias/servers — el backstop real es la
// idempotencia de GOcelular (misma purchase_reference => idempotent_replay / purchase_conflict).
const enviosEnCurso = new Set<string>()

async function cargarCatalogo(imeis: string[]): Promise<CatalogoGocelular | null> {
  const pool = getPool()
  if (!pool) return null
  const client = await pool.connect()
  try {
    const [prov, devAct, devInact, addonsAct, addonsInact, existentes] = await Promise.all([
      client.query<{ name: string }>(`SELECT name FROM suppliers WHERE active = true`),
      client.query<{ sku: string }>(`SELECT sku FROM device_model_skus WHERE active = true`),
      client.query<{ sku: string }>(`SELECT sku FROM device_model_skus WHERE active = false`),
      // draft cuenta como valido para compras (solo oculta de la tienda) — confirmado con GOcelular 2026-08-12
      client.query<{ sku: string }>(`SELECT sku FROM store_products WHERE is_addon = true AND sku IS NOT NULL AND status IN ('active', 'draft')`),
      client.query<{ sku: string }>(`SELECT sku FROM store_products WHERE is_addon = true AND sku IS NOT NULL AND status NOT IN ('active', 'draft')`),
      imeis.length > 0
        ? client.query<{ imei: string }>(`SELECT imei FROM inventory_items WHERE imei = ANY($1)`, [imeis])
        : Promise.resolve({ rows: [] as { imei: string }[] }),
    ])
    return {
      proveedoresActivos: prov.rows.map(r => r.name),
      deviceSkusActivos: new Set(devAct.rows.map(r => r.sku)),
      deviceSkusInactivos: new Set(devInact.rows.map(r => r.sku)),
      addonSkus: new Set(addonsAct.rows.map(r => r.sku)),
      addonSkusInactivos: new Set(addonsInact.rows.map(r => r.sku)),
      imeisExistentes: new Set(existentes.rows.map(r => r.imei)),
    }
  } finally {
    client.release()
  }
}

// Categoria y plataforma por producto: PedidoItem no trae ninguna de las dos, se
// resuelven contra compras_productos por productoId. Si el producto no aparece en
// la tabla se asume 'Celulares' / 'gocelular' (defaults seguros: no genera una
// linea addon espuria ni desvia la compra al endpoint de GOmarket).
async function cargarProductosInfo(pedido: Pedido): Promise<{ categorias: Map<string, string>; plataformas: Map<string, string> }> {
  const ids = [...new Set(pedido.items.map(i => i.productoId))]
  const categorias = new Map<string, string>()
  const plataformas = new Map<string, string>()
  if (ids.length === 0) return { categorias, plataformas }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('compras_productos')
    .select('id, categoria, plataforma')
    .in('id', ids)
  for (const row of (data ?? []) as { id: string; categoria: string; plataforma: string | null }[]) {
    categorias.set(row.id, row.categoria)
    plataformas.set(row.id, row.plataforma ?? 'gocelular')
  }
  return { categorias, plataformas }
}

// Todos los skus conocidos de device_model_skus (para que parseImeiExcel identifique la
// columna de SKU) y el mapeo sku -> nombre de modelo (para costosDevices), en una sola
// conexion/query — antes eran dos conexiones separadas (una aca, otra dentro de costosDevices).
async function cargarSkusYNombres(): Promise<{ skusConocidos: Set<string>; skuToNombre: Map<string, string> }> {
  const pool = getPool()
  if (!pool) return { skusConocidos: new Set(), skuToNombre: new Map() }
  const client = await pool.connect()
  try {
    const res = await client.query<{ sku: string; nombre: string | null }>(
      `SELECT dms.sku, dm.name AS nombre
       FROM device_model_skus dms LEFT JOIN device_models dm ON dm.model_code = dms.model_code`
    )
    const skusConocidos = new Set(res.rows.map(r => r.sku))
    const skuToNombre = new Map<string, string>()
    for (const r of res.rows) {
      if (r.nombre) skuToNombre.set(r.sku, r.nombre)
    }
    return { skusConocidos, skuToNombre }
  } finally {
    client.release()
  }
}

const tieneCostoValido = (i: PedidoItem): boolean =>
  typeof i.precio === 'number' && Number.isFinite(i.precio) && i.precio > 0

// Para addons el costo es obligatorio y $0 es legitimo (kits bonificados)
const tieneCostoAddon = (i: PedidoItem): boolean =>
  typeof i.precio === 'number' && Number.isFinite(i.precio) && i.precio >= 0

// Mapeo best-effort del costo de devices: SKU del Excel -> nombre de modelo GOcelular -> item
// del pedido. Recibe los items ya clasificados como device por el caller (no re-deriva la
// clasificacion por precio, para no confundir un addon con un device) y el mapeo sku->nombre
// precargado (no abre conexion propia).
function costosDevices(deviceItems: PedidoItem[], skus: string[], skuToNombre: Map<string, string>): Map<string, string> {
  const costos = new Map<string, string>()
  // Caso inequivoco: un solo modelo de celular (device) en el pedido y un solo SKU en el Excel
  const celulares = deviceItems.filter(tieneCostoValido)
  if (skus.length === 1 && celulares.length === 1) {
    costos.set(skus[0], celulares[0].precio.toFixed(2))
    return costos
  }
  // Match por nombre de modelo via el mapeo sku -> nombre
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const sku of skus) {
    const nombre = skuToNombre.get(sku)
    if (!nombre) continue
    const item = deviceItems.find(i => norm(i.productoNombre) === norm(nombre))
    if (item && tieneCostoValido(item)) costos.set(sku, item.precio.toFixed(2))
  }
  return costos
}

async function persistir(pedidoId: string, gocelular: GocelularEstado) {
  const supabase = createAdminClient()
  const { data, error: selectError } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (selectError || !data) {
    console.error(`persistir: no pude leer pedido_${pedidoId} para guardar estado gocelular`, selectError)
    return
  }
  let pedido: Pedido
  try {
    pedido = JSON.parse(data.value) as Pedido
  } catch (e) {
    console.error(`persistir: JSON invalido en pedido_${pedidoId}, no se pudo guardar el estado gocelular`, e)
    return
  }
  pedido.gocelular = gocelular
  const row = {
    key: `pedido_${pedidoId}`,
    value: JSON.stringify(pedido),
    updated_at: new Date().toISOString(),
  }
  let { error } = await supabase.from('flujo_config').upsert(row)
  if (error) {
    console.error(`persistir: fallo el upsert de pedido_${pedidoId}, reintentando una vez`, error)
    ;({ error } = await supabase.from('flujo_config').upsert(row))
    if (error) {
      console.error(`persistir: el reintento tambien fallo para pedido_${pedidoId} — estado gocelular no quedo guardado`, error)
    }
  }
  revalidatePath('/compras/gestor')
  revalidatePath('/compras')
}

export async function informarCompraGocelular(pedidoId: string): Promise<{ ok: boolean; estado: string }> {
  if (enviosEnCurso.has(pedidoId)) return { ok: false, estado: 'en_curso' }
  enviosEnCurso.add(pedidoId)
  try {
    const supabase = createAdminClient()
    const { data, error: selectError } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
    if (selectError || !data) return { ok: false, estado: 'pedido_no_encontrado' }
    let pedido: Pedido
    try {
      pedido = JSON.parse(data.value) as Pedido
    } catch {
      return { ok: false, estado: 'pedido_no_encontrado' }
    }

    if (pedido.gocelular?.estado === 'informado') {
      return { ok: true, estado: 'informado' } // ya informado, no re-disparar
    }

    const { categorias, plataformas } = await cargarProductosInfo(pedido)

    // Ruteo por plataforma: los pedidos de GOmarket van al webhook Commerce v1,
    // el resto al webhook de compras clasico de GOcelular. Mezcla = error.
    const plataforma = pedido.plataforma
      ?? plataformaDePedido(pedido.items.map(i => i.productoId), plataformas)
    if (plataforma === 'mixto') {
      await persistir(pedidoId, {
        estado: 'validacion_fallida',
        errores: ['El pedido mezcla productos de GOcelular y de GOmarket — separalos en pedidos distintos (cada plataforma se informa a un endpoint diferente)'],
      })
      return { ok: false, estado: 'validacion_fallida' }
    }
    if (plataforma === 'gomarket') {
      return informarCompraGomarket(pedidoId, pedido)
    }
    if (pedido.destino === 'andreani_wh2') {
      await persistir(pedidoId, {
        estado: 'validacion_fallida',
        errores: ['Warehouse Andreani 2 por ahora es solo para compras de GOmarket — el webhook de compras de GOcelular no acepta ese destino'],
      })
      return { ok: false, estado: 'validacion_fallida' }
    }

    const esCelular = (productoId: string) => (categorias.get(productoId) ?? 'Celulares') === 'Celulares'
    const itemsDevice = pedido.items.filter(i => esCelular(i.productoId))
    const itemsAddon = pedido.items.filter(i => !esCelular(i.productoId))
    const tieneCelulares = itemsDevice.length > 0

    // 1. Lineas device desde el Excel de IMEIs
    const lines: PurchaseLine[] = []
    let refN = 0
    const nextRef = () => `L${++refN}`
    const warningsAlias: string[] = []

    if (tieneCelulares) {
      if (!pedido.imeiFile) {
        await persistir(pedidoId, { estado: 'validacion_fallida', errores: ['El pedido tiene celulares pero no se cargó el Excel de IMEIs'] })
        return { ok: false, estado: 'validacion_fallida' }
      }
      const { skusConocidos, skuToNombre } = await cargarSkusYNombres()
      const parsed = parseImeiExcel(pedido.imeiFile, skusConocidos)
      if (parsed.errores.length > 0) {
        await persistir(pedidoId, { estado: 'validacion_fallida', errores: parsed.errores })
        return { ok: false, estado: 'validacion_fallida' }
      }

      // Dry run contra la tabla de alias de GOcelular (lineamiento de Pedro):
      // las cantidades por modelo según el alias tienen que calzar con el
      // pedido ANTES de enviar — ataja alias creados con el modelo equivocado
      const dryRun = verificarAliasVsPedido(
        parsed.lines.map(l => ({ sku: l.sku, unidades: l.imeis.length })),
        skuToNombre,
        itemsDevice.map(i => ({ productoNombre: i.productoNombre, cantidad: i.cantidad })),
      )
      if (dryRun.errores.length > 0) {
        await persistir(pedidoId, { estado: 'validacion_fallida', errores: dryRun.errores, warnings: dryRun.warnings })
        return { ok: false, estado: 'validacion_fallida' }
      }
      warningsAlias.push(...dryRun.warnings)

      const costos = costosDevices(itemsDevice, parsed.lines.map(l => l.sku), skuToNombre)
      for (const l of parsed.lines) {
        lines.push({
          line_reference: nextRef(),
          item_type: 'device',
          sku: l.sku,
          imeis: l.imeis,
          ...(l.ean ? { ean: l.ean } : {}),
          ...(costos.has(l.sku) ? { unit_cost: costos.get(l.sku) } : {}),
        })
      }
    }

    // 2. Lineas addon desde los items del pedido
    for (const item of itemsAddon) {
      lines.push({
        line_reference: nextRef(),
        item_type: 'addon',
        sku: item.productoCodigo,
        quantity: item.cantidad,
        // Sin costo valido (null/undefined/0/no-numerico) se omite el campo: validarCompra
        // produce el error de validacion "requieren costo unitario" en vez de crashear.
        ...(tieneCostoAddon(item) ? { unit_cost: item.precio.toFixed(2) } : {}),
        description: item.productoNombre.slice(0, 256),
      })
    }

    // 3. Pre-validacion contra catalogo GOcelular
    const todosImeis = lines.flatMap(l => l.imeis ?? [])
    const catalogo = await cargarCatalogo(todosImeis)
    if (!catalogo) {
      await persistir(pedidoId, { estado: 'error_reintentable', errores: ['No pude conectar a la base de GOcelular para validar'] })
      return { ok: false, estado: 'error_reintentable' }
    }
    const val = validarCompra(pedido.proveedorNombre, lines, catalogo)
    if (val.errores.length > 0) {
      await persistir(pedidoId, { estado: 'validacion_fallida', errores: val.errores, warnings: [...warningsAlias, ...val.warnings] })
      return { ok: false, estado: 'validacion_fallida' }
    }

    // 4. Enviar
    const payload: PurchasePayload = {
      purchase_reference: pedido.id,
      supplier: pedido.proveedorNombre.trim(),
      destination: pedido.destino === 'local' ? 'local' : 'andreani_wh', // wh2 ya bloqueado arriba
      lines,
      timestamp: buildTimestamp(),
    }
    const res = await sendPurchaseWebhook(payload)

    // 5. Persistir resultado
    if (res.ok) {
      // Si este persist falla, un reintento posterior del mismo pedido es inocuo: GOcelular
      // es idempotente por purchase_reference (el timestamp queda fuera del hash) y responde
      // idempotent_replay en vez de duplicar la compra.
      await persistir(pedidoId, {
        estado: 'informado',
        purchaseId: res.body?.purchase_id,
        requestId: res.body?.request_id,
        enviadoAt: new Date().toISOString(),
        batches: (res.body?.batches ?? []).map(b => ({ type: b.type, lines: b.lines, units: b.units })),
        pendingAliases: (res.body?.lineas_pendientes_alias ?? []).map(a => ({ lineReference: a.line_reference, sku: a.sku })),
        warnings: [...warningsAlias, ...val.warnings],
      })
      return { ok: true, estado: 'informado' }
    }

    if ((res.retryable || res.status === 0) && res.body?.code !== 'payload_too_large_local') {
      await persistir(pedidoId, {
        estado: 'error_reintentable',
        codigoError: res.body?.code,
        errores: [res.body?.code === 'secret_no_configurado'
          ? 'Falta configurar GOCELULAR_WEBHOOK_SECRET'
          : `GOcelular no respondió (HTTP ${res.status}) tras 4 intentos — reintentá en unos minutos`],
        warnings: [...warningsAlias, ...val.warnings],
      })
      return { ok: false, estado: 'error_reintentable' }
    }

    // 4xx / 409: rechazado
    const detalles = (res.body?.errors ?? []).map(e =>
      [e.path, e.line_reference, e.sku].filter(Boolean).join(' · ')
    ).filter(Boolean)
    const mensajes: Record<string, string> = {
      unauthorized: 'Firma rechazada — revisar GOCELULAR_WEBHOOK_SECRET',
      invalid_payload: 'GOcelular rechazó el formato del payload',
      supplier_desconocido: 'GOcelular no reconoce el proveedor',
      supplier_ambiguo: 'El nombre del proveedor matchea más de uno en GOcelular',
      sku_inactivo: 'Algún SKU existe pero está inactivo en GOcelular',
      imeis_invalid: 'GOcelular rechazó IMEIs (no se guardó nada — corregir y reintentar con el mismo pedido)',
      purchase_conflict: 'Este pedido ya fue informado con otros datos — coordinar corrección manual con GOcelular',
      payload_too_large_local: 'El payload supera 1 MB — dividí la compra en pedidos más chicos',
    }
    await persistir(pedidoId, {
      estado: 'rechazado',
      codigoError: res.body?.code,
      errores: [mensajes[res.body?.code ?? ''] ?? `GOcelular rechazó la compra (${res.body?.code ?? 'HTTP ' + res.status})`, ...detalles],
      warnings: [...warningsAlias, ...val.warnings],
    })
    return { ok: false, estado: 'rechazado' }
  } finally {
    enviosEnCurso.delete(pedidoId)
  }
}

// Catalogo de SKUs de GOmarket desde la replica de GOcelular (commerce_skus):
// los SKUs existen ANTES de la compra, uno desconocido rebota con unknown_sku.
async function cargarCatalogoCommerce(skus: string[]): Promise<Map<string, SkuCommerce> | null> {
  const pool = getPool()
  if (!pool || skus.length === 0) return pool ? new Map() : null
  const client = await pool.connect()
  try {
    const res = await client.query<{ sku: string; is_active: boolean; serial_policy: string | null }>(
      `SELECT sku, is_active, serial_policy FROM commerce_skus WHERE sku = ANY($1)`,
      [skus]
    )
    return new Map(res.rows.map(r => [r.sku, { sku: r.sku, activo: r.is_active, serialPolicy: r.serial_policy }]))
  } finally {
    client.release()
  }
}

// Compra de GOmarket → webhook Commerce v1 (POST /api/webhooks/commerce/v1/purchases).
// Sin IMEIs: una linea por SKU con quantity (los SKUs viven en commerce_skus).
// Reusa el mismo estado persistido `gocelular` del pedido (el chip cambia el label).
async function informarCompraGomarket(pedidoId: string, pedido: Pedido): Promise<{ ok: boolean; estado: string }> {
  const { lines, errores: erroresLineas } = armarLineasGomarket(pedido.items.map(i => ({
    productoCodigo: i.productoCodigo,
    productoNombre: i.productoNombre,
    cantidad: i.cantidad,
    precio: i.precio,
  })))
  if (erroresLineas.length > 0 || lines.length === 0) {
    await persistir(pedidoId, {
      estado: 'validacion_fallida',
      errores: erroresLineas.length > 0 ? erroresLineas : ['El pedido no tiene líneas informables'],
    })
    return { ok: false, estado: 'validacion_fallida' }
  }

  const catalogo = await cargarCatalogoCommerce(lines.map(l => l.sku))
  if (!catalogo) {
    await persistir(pedidoId, { estado: 'error_reintentable', errores: ['No pude conectar a la base de GOcelular para validar los SKUs de GOmarket'] })
    return { ok: false, estado: 'error_reintentable' }
  }
  const val = validarSkusCommerce(lines, catalogo)
  if (val.errores.length > 0) {
    await persistir(pedidoId, { estado: 'validacion_fallida', errores: val.errores, warnings: val.warnings })
    return { ok: false, estado: 'validacion_fallida' }
  }

  const payload: CommercePurchasePayload = {
    storefront: 'go-market',
    destination: pedido.destino ?? 'andreani_wh',
    purchase_ref: pedido.id,
    lines,
  }
  const res = await sendCommercePurchaseWebhook(payload)

  if (res.ok) {
    await persistir(pedidoId, {
      estado: 'informado',
      purchaseId: res.body?.purchase_id,
      requestId: res.body?.request_id,
      enviadoAt: new Date().toISOString(),
      batches: [{ type: 'addon', lines: lines.length, units: lines.reduce((s, l) => s + l.quantity, 0) }],
      warnings: [...val.warnings, ...(res.body?.warnings ?? [])],
    })
    return { ok: true, estado: 'informado' }
  }

  if ((res.retryable || res.status === 0) && res.body?.code !== 'payload_too_large_local') {
    await persistir(pedidoId, {
      estado: 'error_reintentable',
      codigoError: res.body?.code,
      errores: [res.body?.code === 'secret_no_configurado'
        ? 'Falta configurar GOMARKET_WEBHOOK_SECRET (coordinar el secret del webhook Commerce con GOcelular)'
        : `GOmarket no respondió (HTTP ${res.status}) tras los reintentos — reintentá en unos minutos`],
      warnings: val.warnings,
    })
    return { ok: false, estado: 'error_reintentable' }
  }

  const detalles = (res.body?.errors ?? []).map(e => [e.path, e.sku].filter(Boolean).join(' · ')).filter(Boolean)
  const mensajes: Record<string, string> = {
    unauthorized: 'Firma rechazada — GOcelular todavía no configuró el secret del webhook Commerce, o GOMARKET_WEBHOOK_SECRET no coincide',
    endpoint_disabled: 'El endpoint de compras de GOmarket está apagado en GOcelular (commerce_external_purchase_webhook_enabled) — avisale a Pedro',
    unknown_sku: 'Algún SKU no existe en el catálogo de GOmarket (commerce_skus) — darlo de alta antes de informar',
    inbound_shipment_closed: 'Esta compra ya fue anunciada a Andreani: una línea nueva va en una compra NUEVA con otro pedido (no se escribió nada)',
    invalid_payload: 'GOcelular rechazó el formato del payload Commerce',
    payload_too_large_local: 'El payload supera 1 MB — dividí la compra en pedidos más chicos',
  }
  await persistir(pedidoId, {
    estado: 'rechazado',
    codigoError: res.body?.code,
    errores: [mensajes[res.body?.code ?? ''] ?? `GOmarket rechazó la compra (${res.body?.code ?? 'HTTP ' + res.status})`, ...detalles],
    warnings: val.warnings,
  })
  return { ok: false, estado: 'rechazado' }
}
