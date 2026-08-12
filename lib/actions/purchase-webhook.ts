'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendPurchaseWebhook, buildTimestamp, type PurchaseLine, type PurchasePayload } from '@/lib/gocelular-webhook'
import { parseImeiExcel } from '@/lib/imei-excel-parser'
import { validarCompra, type CatalogoGocelular } from '@/lib/purchase-validation'
import type { Pedido, GocelularEstado } from '@/lib/actions/compras'

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

// Mapeo best-effort del costo de devices: SKU del Excel -> nombre de modelo GOcelular -> item del pedido
async function costosDevices(pedido: Pedido, skus: string[]): Promise<Map<string, string>> {
  const costos = new Map<string, string>()
  // Caso inequivoco: un solo modelo de celular en el pedido y un solo SKU en el Excel
  const celulares = pedido.items.filter(i => i.precio > 0)
  if (skus.length === 1 && celulares.length === 1) {
    costos.set(skus[0], celulares[0].precio.toFixed(2))
    return costos
  }
  // Match por nombre de modelo via device_model_skus -> device_models
  const pool = getPool()
  if (!pool || skus.length === 0) return costos
  const client = await pool.connect()
  try {
    const res = await client.query<{ sku: string; nombre: string }>(
      `SELECT dms.sku, dm.name AS nombre
       FROM device_model_skus dms JOIN device_models dm ON dm.model_code = dms.model_code
       WHERE dms.sku = ANY($1)`,
      [skus]
    )
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    for (const r of res.rows) {
      const item = pedido.items.find(i => norm(i.productoNombre) === norm(r.nombre))
      if (item) costos.set(r.sku, item.precio.toFixed(2))
    }
  } finally {
    client.release()
  }
  return costos
}

async function persistir(pedidoId: string, gocelular: GocelularEstado) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return
  const pedido = JSON.parse(data.value) as Pedido
  pedido.gocelular = gocelular
  await supabase.from('flujo_config').upsert({
    key: `pedido_${pedidoId}`,
    value: JSON.stringify(pedido),
    updated_at: new Date().toISOString(),
  })
  revalidatePath('/compras/gestor')
  revalidatePath('/compras')
}

export async function informarCompraGocelular(pedidoId: string): Promise<{ ok: boolean; estado: string }> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return { ok: false, estado: 'pedido_no_encontrado' }
  const pedido = JSON.parse(data.value) as Pedido

  if (pedido.gocelular?.estado === 'informado') {
    return { ok: true, estado: 'informado' } // ya informado, no re-disparar
  }

  const categorias = await cargarCategorias(pedido)
  const esCelular = (productoId: string) => (categorias.get(productoId) ?? 'Celulares') === 'Celulares'
  const itemsAddon = pedido.items.filter(i => !esCelular(i.productoId))
  const tieneCelulares = pedido.items.length > itemsAddon.length

  // 1. Lineas device desde el Excel de IMEIs
  const lines: PurchaseLine[] = []
  let refN = 0
  const nextRef = () => `L${++refN}`

  if (tieneCelulares) {
    if (!pedido.imeiFile) {
      await persistir(pedidoId, { estado: 'validacion_fallida', errores: ['El pedido tiene celulares pero no se cargó el Excel de IMEIs'] })
      return { ok: false, estado: 'validacion_fallida' }
    }
    const pool = getPool()
    let skusConocidos = new Set<string>()
    if (pool) {
      const client = await pool.connect()
      try {
        const res = await client.query<{ sku: string }>(`SELECT sku FROM device_model_skus`)
        skusConocidos = new Set(res.rows.map(r => r.sku))
      } finally {
        client.release()
      }
    }
    const parsed = parseImeiExcel(pedido.imeiFile, skusConocidos)
    if (parsed.errores.length > 0) {
      await persistir(pedidoId, { estado: 'validacion_fallida', errores: parsed.errores })
      return { ok: false, estado: 'validacion_fallida' }
    }
    const costos = await costosDevices(pedido, parsed.lines.map(l => l.sku))
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
      unit_cost: item.precio.toFixed(2),
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
  if (res.ok && res.body) {
    await persistir(pedidoId, {
      estado: 'informado',
      purchaseId: res.body.purchase_id,
      requestId: res.body.request_id,
      enviadoAt: new Date().toISOString(),
      batches: (res.body.batches ?? []).map(b => ({ type: b.type, lines: b.lines, units: b.units })),
      pendingAliases: (res.body.lineas_pendientes_alias ?? []).map(a => ({ lineReference: a.line_reference, sku: a.sku })),
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
}
