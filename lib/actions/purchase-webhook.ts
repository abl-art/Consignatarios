'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendPurchaseWebhook, buildTimestamp, type PurchaseLine, type PurchasePayload } from '@/lib/gocelular-webhook'
import { parseImeiExcel } from '@/lib/imei-excel-parser'
import { validarCompra, type CatalogoGocelular } from '@/lib/purchase-validation'
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
      client.query<{ sku: string }>(`SELECT sku FROM store_products WHERE is_addon = true AND sku IS NOT NULL AND status = 'active'`),
      client.query<{ sku: string }>(`SELECT sku FROM store_products WHERE is_addon = true AND sku IS NOT NULL AND status <> 'active'`),
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

// Categoria por producto: PedidoItem no trae categoria propia, se resuelve contra
// compras_productos (columna categoria) por productoId. Si el producto no aparece
// en la tabla se asume 'Celulares' (default seguro: no genera una linea addon espuria).
async function cargarCategorias(pedido: Pedido): Promise<Map<string, string>> {
  const ids = [...new Set(pedido.items.map(i => i.productoId))]
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('compras_productos')
    .select('id, categoria')
    .in('id', ids)
  for (const row of (data ?? []) as { id: string; categoria: string }[]) {
    map.set(row.id, row.categoria)
  }
  return map
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

    const categorias = await cargarCategorias(pedido)
    const esCelular = (productoId: string) => (categorias.get(productoId) ?? 'Celulares') === 'Celulares'
    const itemsDevice = pedido.items.filter(i => esCelular(i.productoId))
    const itemsAddon = pedido.items.filter(i => !esCelular(i.productoId))
    const tieneCelulares = itemsDevice.length > 0

    // 1. Lineas device desde el Excel de IMEIs
    const lines: PurchaseLine[] = []
    let refN = 0
    const nextRef = () => `L${++refN}`

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
        ...(tieneCostoValido(item) ? { unit_cost: item.precio.toFixed(2) } : {}),
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
      await persistir(pedidoId, { estado: 'validacion_fallida', errores: val.errores, warnings: val.warnings })
      return { ok: false, estado: 'validacion_fallida' }
    }

    // 4. Enviar
    const payload: PurchasePayload = {
      purchase_reference: pedido.id,
      supplier: pedido.proveedorNombre.trim(),
      destination: pedido.destino ?? 'andreani_wh',
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
        warnings: val.warnings,
      })
      return { ok: true, estado: 'informado' }
    }

    if (res.retryable || res.status === 0) {
      await persistir(pedidoId, {
        estado: 'error_reintentable',
        codigoError: res.body?.code,
        errores: [res.body?.code === 'secret_no_configurado'
          ? 'Falta configurar GOCELULAR_WEBHOOK_SECRET'
          : `GOcelular no respondió (HTTP ${res.status}) tras 3 intentos — reintentá en unos minutos`],
        warnings: val.warnings,
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
    }
    await persistir(pedidoId, {
      estado: 'rechazado',
      codigoError: res.body?.code,
      errores: [mensajes[res.body?.code ?? ''] ?? `GOcelular rechazó la compra (${res.body?.code ?? 'HTTP ' + res.status})`, ...detalles],
      warnings: val.warnings,
    })
    return { ok: false, estado: 'rechazado' }
  } finally {
    enviosEnCurso.delete(pedidoId)
  }
}
