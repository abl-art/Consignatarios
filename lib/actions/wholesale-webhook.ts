'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendWholesaleWebhook, buildTimestamp } from '@/lib/gocelular-webhook'
import { validarVenta, type CatalogoVenta, type DeliveryInput } from '@/lib/wholesale-validation'
import type { GocelularVentaEstado, ProformaConItems, ProformaItem } from '@/lib/actions/proformas'
import type { ClienteMayorista } from '@/lib/types'

// Best-effort por-instancia: evita que dos disparos concurrentes de la misma proforma (ej. el
// trigger de confirmarProforma + un click manual de "Reintentar" casi simultaneos) manden el
// webhook dos veces. No es un lock distribuido — el backstop real es la idempotencia de GOcelular
// (mismo proforma_number => idempotent_replay / proforma_conflict).
const enviosEnCurso = new Set<string>()

interface WholesaleLine {
  line_reference?: string
  item_type?: 'device' | 'addon'
  sku?: string
  description: string
  quantity: number
  gross_subtotal: string
}

interface WholesalePayload {
  proforma_number: string
  gocuotas_store_id: string
  consignatario: string
  buyer: { cuit: string; name: string; address?: string; tax_treatment: string }
  lines: WholesaleLine[]
  total_amount: string
  sell_condition: { type: 'current_account'; days: number }
  imeis?: string[]
  fulfillment?: 'andreani_wh'
  delivery?: DeliveryInput
  timestamp: string
}

// ---------------------------------------------------------------------------
// Catalogo GOcelular (base externa via pg)
// ---------------------------------------------------------------------------

// Vincula el IMEI consignado con su store: inventory_items.consigned_to_store_id (uuid) referencia
// gocuotas_stores.id (uuid) — el gocuotas_store_id "numerico" que usa el resto del sistema (y que
// llega en cliente.gocuotas_store_id) vive en gocuotas_stores, por eso hace falta el LEFT JOIN para
// poder comparar contra el storeId de la venta (ambos como texto). Verificado contra la base real
// 2026-08-12: la columna NO se llama store_id ni consigned_store_id.
async function cargarCatalogoVenta(storeId: string, imeis: string[]): Promise<CatalogoVenta | null> {
  const pool = getPool()
  if (!pool) return null
  const client = await pool.connect()
  try {
    const [storeRes, imeisRes] = await Promise.all([
      storeId
        ? client.query<{ gocuotas_store_id: string; store_name: string; merchant_name: string; is_active: boolean }>(
            `SELECT gocuotas_store_id, store_name, merchant_name, is_active FROM gocuotas_stores WHERE gocuotas_store_id = $1`,
            [storeId]
          )
        : Promise.resolve({ rows: [] as { gocuotas_store_id: string; store_name: string; merchant_name: string; is_active: boolean }[] }),
      imeis.length > 0
        ? client.query<{ imei: string; status: string; store_ref: string | null }>(
            `SELECT ii.imei, ii.status::text, gs.gocuotas_store_id AS store_ref
             FROM inventory_items ii
             LEFT JOIN gocuotas_stores gs ON gs.id = ii.consigned_to_store_id
             WHERE ii.imei = ANY($1)`,
            [imeis]
          )
        : Promise.resolve({ rows: [] as { imei: string; status: string; store_ref: string | null }[] }),
    ])
    const storeRow = storeRes.rows[0]
    const imeisEstado = new Map<string, { status: string; storeId: string | null }>()
    for (const row of imeisRes.rows) imeisEstado.set(row.imei, { status: row.status, storeId: row.store_ref })
    return {
      store: storeRow
        ? { existe: true, activo: storeRow.is_active, nombre: storeRow.merchant_name }
        : { existe: false, activo: false, nombre: null },
      imeisEstado,
      // GOcelular no expone (por ahora) un catalogo propio de jurisdicciones vía esta base:
      // validarVenta cae a PROVINCIAS_AR cuando la lista viene vacía.
      provincias: [],
    }
  } finally {
    client.release()
  }
}

interface DeviceSkuRow { modelCode: string; nombre: string; sku: string }
interface AddonSkuRow { nombre: string; sku: string }

// Mismo criterio de resolución que costosDevices en purchase-webhook.ts: match de nombre
// normalizado (minusculas, espacios colapsados, trim) contra device_models.name (devices) o
// store_products.display_name (addons, is_addon=true, status active|draft).
async function cargarSkusAndreani(): Promise<{ devices: DeviceSkuRow[]; addons: AddonSkuRow[] } | null> {
  const pool = getPool()
  if (!pool) return null
  const client = await pool.connect()
  try {
    const [devRes, addonRes] = await Promise.all([
      client.query<{ sku: string; model_code: string; nombre: string | null }>(
        `SELECT dms.sku, dms.model_code, dm.name AS nombre
         FROM device_model_skus dms JOIN device_models dm ON dm.model_code = dms.model_code
         WHERE dms.active = true`
      ),
      client.query<{ nombre: string; sku: string }>(
        `SELECT display_name AS nombre, sku FROM store_products
         WHERE is_addon = true AND sku IS NOT NULL AND status IN ('active', 'draft')`
      ),
    ])
    return {
      devices: devRes.rows
        .filter((r): r is { sku: string; model_code: string; nombre: string } => !!r.nombre)
        .map(r => ({ modelCode: r.model_code, nombre: r.nombre, sku: r.sku })),
      addons: addonRes.rows,
    }
  } finally {
    client.release()
  }
}

async function cargarStockAndreani(modelCodes: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const pool = getPool()
  if (!pool || modelCodes.length === 0) return map
  const client = await pool.connect()
  try {
    const res = await client.query<{ model_code: string; cnt: string }>(
      `SELECT model_code, COUNT(*)::text AS cnt FROM inventory_items
       WHERE status = 'available' AND physical_location = 'andreani_wh' AND model_code = ANY($1)
       GROUP BY model_code`,
      [modelCodes]
    )
    for (const row of res.rows) map.set(row.model_code, parseInt(row.cnt, 10))
    return map
  } finally {
    client.release()
  }
}

const normalizarNombre = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// compras_productos vive en Supabase, no en la base de GOcelular (misma fuente que
// purchase-webhook.ts usa para clasificar device vs addon).
async function cargarCategorias(items: ProformaItem[]): Promise<Map<string, string>> {
  const ids = [...new Set(items.map(i => i.producto_id))]
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const supabase = createAdminClient()
  const { data } = await supabase.from('compras_productos').select('id, categoria').in('id', ids)
  for (const row of (data ?? []) as { id: string; categoria: string }[]) map.set(row.id, row.categoria)
  return map
}

// ---------------------------------------------------------------------------
// Construccion del payload (catalogo + pre-validacion + armado) — solo corre en el primer
// intento real; reintentos/replay reusan el payloadEnviado persistido, nunca vuelven a pasar
// por acá.
// ---------------------------------------------------------------------------

type ConstruirPayloadResult =
  | { payload: WholesalePayload; warnings: string[] }
  | Pick<GocelularVentaEstado, 'estado' | 'errores' | 'warnings'>

async function construirPayload(proforma: ProformaConItems): Promise<ConstruirPayloadResult> {
  const supabase = createAdminClient()

  const { data: clienteRow } = proforma.cliente_mayorista_id
    ? await supabase.from('clientes_mayoristas').select('*').eq('id', proforma.cliente_mayorista_id).single()
    : { data: null }
  const cliente = clienteRow as ClienteMayorista | null
  if (!cliente) {
    return { estado: 'validacion_fallida', errores: ['La proforma no tiene un cliente mayorista asociado (o el cliente no existe)'] }
  }

  // El gocuotas_store_id vive en el CLIENTE (no en la proforma): cada cliente mayorista vende
  // siempre a través del mismo local de GOcelular (decisión del controller, fix-review 2026-08-12).
  const storeId = cliente.gocuotas_store_id ?? ''
  if (!storeId) {
    return {
      estado: 'validacion_fallida',
      errores: ['El cliente no tiene configurado el gocuotas_store_id — cargalo en la ficha del cliente'],
    }
  }

  // 2. IMEIs (stock_local): asignaciones de la proforma -> asignacion_items -> dispositivos.imei
  let imeis: string[] | null = null
  if (proforma.origen === 'stock_local') {
    const { data: asigsRaw } = await supabase
      .from('asignaciones')
      .select('id, asignacion_items(dispositivo_id, dispositivos(imei))')
      .eq('proforma_id', proforma.id)
    const asigs = (asigsRaw ?? []) as unknown as {
      id: string
      asignacion_items: { dispositivo_id: string; dispositivos: { imei: string } | null }[] | null
    }[]
    imeis = asigs.flatMap(a => (a.asignacion_items ?? []).map(i => i.dispositivos?.imei).filter(Boolean) as string[])
    const totalUnidades = proforma.proforma_items.reduce((s, i) => s + i.cantidad, 0)
    if (imeis.length !== totalUnidades) {
      return { estado: 'validacion_fallida', errores: [`La asignación de IMEIs está incompleta (${imeis.length} de ${totalUnidades})`] }
    }
  }

  // 3. Catalogo GOcelular
  const catalogo = await cargarCatalogoVenta(storeId, imeis ?? [])
  if (!catalogo) {
    return { estado: 'error_reintentable', errores: ['No pude conectar a la base de GOcelular para validar'] }
  }

  // andreani_wh: resolver SKU de fabricante por producto + stock WH por SKU device
  let lineas: WholesaleLine[]
  const catalogoWarnings: string[] = []
  if (proforma.origen === 'andreani_wh') {
    const [categorias, skus] = await Promise.all([cargarCategorias(proforma.proforma_items), cargarSkusAndreani()])
    if (!skus) {
      return { estado: 'error_reintentable', errores: ['No pude conectar a la base de GOcelular para resolver SKUs'] }
    }

    const skuErrors: string[] = []
    let refN = 0
    const nextRef = () => `L${++refN}`
    const resoluciones: { item: ProformaItem; itemType: 'device' | 'addon'; sku: string; modelCode?: string }[] = []

    for (const item of proforma.proforma_items) {
      // Sin categoria conocida se asume 'Celulares' (default seguro, mismo criterio que compras).
      const categoria = categorias.get(item.producto_id) ?? 'Celulares'
      const needle = normalizarNombre(item.producto_nombre)
      if (categoria === 'Celulares') {
        const match = skus.devices.find(d => normalizarNombre(d.nombre) === needle)
        if (!match) { skuErrors.push(`Mapeá el producto "${item.producto_nombre}" a un SKU de GOcelular`); continue }
        resoluciones.push({ item, itemType: 'device', sku: match.sku, modelCode: match.modelCode })
      } else {
        const match = skus.addons.find(a => normalizarNombre(a.nombre) === needle)
        if (!match) { skuErrors.push(`Mapeá el producto "${item.producto_nombre}" a un SKU de GOcelular`); continue }
        resoluciones.push({ item, itemType: 'addon', sku: match.sku })
      }
    }
    if (skuErrors.length > 0) return { estado: 'validacion_fallida', errores: skuErrors }

    // Stock: solo se verifica localmente para devices (el gate real de GOcelular cubre addons).
    const modelCodes = [...new Set(resoluciones.filter(r => r.itemType === 'device').map(r => r.modelCode as string))]
    const stockMap = await cargarStockAndreani(modelCodes)
    const pedidoPorModelo = new Map<string, number>()
    for (const r of resoluciones) {
      if (r.itemType === 'device' && r.modelCode) {
        pedidoPorModelo.set(r.modelCode, (pedidoPorModelo.get(r.modelCode) ?? 0) + r.item.cantidad)
      } else {
        catalogoWarnings.push(`Stock de accesorio "${r.item.producto_nombre}" no verificable localmente`)
      }
    }
    const stockErrors: string[] = []
    for (const [modelCode, pedido] of pedidoPorModelo) {
      const disponible = stockMap.get(modelCode) ?? 0
      if (pedido > disponible) {
        const nombreModelo = skus.devices.find(d => d.modelCode === modelCode)?.nombre ?? modelCode
        stockErrors.push(`Stock insuficiente en el warehouse para "${nombreModelo}": pedido ${pedido}, disponible ${disponible}`)
      }
    }
    if (stockErrors.length > 0) return { estado: 'validacion_fallida', errores: stockErrors, warnings: catalogoWarnings }

    lineas = resoluciones.map(r => ({
      line_reference: nextRef(),
      item_type: r.itemType,
      sku: r.sku,
      description: r.item.producto_nombre,
      quantity: r.item.cantidad,
      gross_subtotal: r.item.subtotal_con_iva.toFixed(2),
    }))
  } else {
    lineas = proforma.proforma_items.map(item => ({
      description: item.producto_nombre,
      quantity: item.cantidad,
      gross_subtotal: item.subtotal_con_iva.toFixed(2),
    }))
  }

  const delivery: DeliveryInput | null = proforma.origen === 'andreani_wh' ? {
    recipient_name: cliente.entrega_nombre ?? '',
    recipient_dni: cliente.entrega_dni ?? '',
    recipient_phone: cliente.entrega_telefono ?? '',
    recipient_email: cliente.entrega_email ?? '',
    street: cliente.entrega_calle ?? '',
    number: cliente.entrega_numero ?? '',
    ...(cliente.entrega_piso_depto ? { floor_apartment: cliente.entrega_piso_depto } : {}),
    locality: cliente.entrega_localidad ?? '',
    postal_code: cliente.entrega_cp ?? '',
    province: cliente.entrega_provincia ?? '',
  } : null

  // 4. Pre-validacion pura (lib/wholesale-validation.ts)
  const val = validarVenta({
    proformaNumber: String(proforma.nro_proforma ?? ''),
    storeId,
    consignatario: cliente.nombre_comercial || cliente.razon_social || '',
    cuit: cliente.cuit ?? '',
    lineas,
    totalAmount: proforma.total_con_iva.toFixed(2),
    imeis,
    delivery,
    modo: proforma.origen,
  }, catalogo)

  if (val.errores.length > 0) {
    return { estado: 'validacion_fallida', errores: val.errores, warnings: [...val.warnings, ...catalogoWarnings] }
  }

  // 5. Armar payload final
  // consignatario: mandamos el nombre TAL COMO lo tiene GOcelular (catalogo.store.nombre), no
  // nuestro propio texto — validarVenta ya garantizó (sin errores) que son el mismo local
  // (comparación case/tilde-insensitive vía anti-XOXO), pero el casing exacto puede diferir.
  const payload: WholesalePayload = {
    proforma_number: String(proforma.nro_proforma),
    gocuotas_store_id: storeId,
    consignatario: catalogo.store.nombre ?? (cliente.nombre_comercial || cliente.razon_social || ''),
    buyer: {
      cuit: cliente.cuit ?? '',
      name: cliente.razon_social || cliente.nombre_comercial,
      ...(cliente.direccion_entrega ? { address: cliente.direccion_entrega } : {}),
      tax_treatment: cliente.condicion_iva,
    },
    lines: lineas,
    total_amount: proforma.total_con_iva.toFixed(2),
    sell_condition: { type: 'current_account', days: cliente.plazo_dias ?? 70 },
    ...(proforma.origen === 'stock_local' ? { imeis: imeis ?? [] } : {}),
    ...(proforma.origen === 'andreani_wh' ? { fulfillment: 'andreani_wh' as const, delivery: delivery! } : {}),
    timestamp: buildTimestamp(),
  }

  return { payload, warnings: [...val.warnings, ...catalogoWarnings] }
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

// Devuelve true si el UPDATE quedó guardado (tras el reintento, si hizo falta). El único llamador
// que necesita chequear el resultado es el persist pre-POST en informarVentaGocelular (si ese no
// se guardó, no hay que enviar — ver comentario ahí); el resto de los llamadores post-envío
// mantienen el comportamiento tolerante de siempre (best-effort, solo console.error).
async function persistir(proformaId: string, gocelular: GocelularVentaEstado): Promise<boolean> {
  const supabase = createAdminClient()
  let { error } = await supabase.from('proformas').update({ gocelular }).eq('id', proformaId)
  if (error) {
    console.error(`persistir: fallo el update de gocelular para proforma ${proformaId}, reintentando una vez`, error)
    ;({ error } = await supabase.from('proformas').update({ gocelular }).eq('id', proformaId))
    if (error) {
      console.error(`persistir: el reintento tambien fallo para proforma ${proformaId} — estado gocelular no quedo guardado`, error)
    }
  }
  revalidatePath('/mayoristas/proformas')
  revalidatePath('/mayoristas/asignaciones')
  return !error
}

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

const MENSAJES: Record<string, string> = {
  unauthorized: 'Firma rechazada — revisar GOCELULAR_WEBHOOK_SECRET',
  invalid_payload: 'GOcelular rechazó el formato del payload',
  invalid_imei: 'Algún IMEI tiene formato inválido',
  duplicate_imeis: 'Hay IMEIs duplicados en el lote',
  store_mismatch: 'El store_id y el nombre del local no coinciden en GOcelular — verificá el gocuotas_store_id del cliente',
  imeis_invalid: 'GOcelular rechazó IMEIs del lote (no se registró nada — corregir inventario y reintentar)',
  proforma_conflict: 'Esta proforma ya fue informada con otros datos — coordinar corrección manual con GOcelular',
  sku_desconocido: 'Algún SKU no existe en el catálogo de GOcelular',
  sku_inactivo: 'Algún SKU está inactivo en GOcelular',
  stock_insuficiente: 'Stock insuficiente en el warehouse para algún SKU',
  addon_fulfillment_unavailable: 'El soporte de accesorios en warehouse está apagado — NO reintentar, avisar a GOcelular',
  payload_too_large_local: 'El payload supera 1 MB',
}

export async function informarVentaGocelular(proformaId: string, opts?: { replay?: boolean }): Promise<{ ok: boolean; estado: string }> {
  if (enviosEnCurso.has(proformaId)) return { ok: false, estado: 'en_curso' }
  enviosEnCurso.add(proformaId)
  try {
    const supabase = createAdminClient()

    // 1. Cargar proforma + items
    const { data: proformaRow, error: pfError } = await supabase
      .from('proformas')
      .select('*, proforma_items(*)')
      .eq('id', proformaId)
      .single()
    if (pfError || !proformaRow) return { ok: false, estado: 'proforma_no_encontrada' }
    const proforma = proformaRow as ProformaConItems

    if (proforma.estado !== 'confirmada') return { ok: false, estado: 'no_confirmada' }
    if (proforma.gocelular?.estado === 'informado' && !opts?.replay) return { ok: true, estado: 'informado' }

    let rawBody: string

    if (proforma.gocelular?.payloadEnviado) {
      // Reintento manual o replay: reusar el body byte-identico persistido en el primer intento —
      // NUNCA regenerar (el timestamp del body participa del hash de idempotencia legacy de
      // GOcelular; un body distinto para la misma proforma dispara un 409 proforma_conflict espurio).
      rawBody = proforma.gocelular.payloadEnviado
    } else {
      const built = await construirPayload(proforma)
      if ('estado' in built) {
        await persistir(proformaId, built)
        return { ok: false, estado: built.estado }
      }
      rawBody = JSON.stringify(built.payload)
      // Persistir el payload ANTES del POST: si el proceso muere aca, el proximo intento reusa
      // este mismo body en vez de regenerar uno distinto. Si este guardado falla (incluso tras el
      // reintento interno de persistir), NO hay que enviar: un intento posterior reconstruiria el
      // payload con timestamp fresco y dispararia el 409 proforma_conflict espurio que este
      // mecanismo existe para evitar. Mejor abortar y quedar en error_reintentable.
      const guardado = await persistir(proformaId, { estado: 'no_enviado', payloadEnviado: rawBody, warnings: built.warnings })
      if (!guardado) {
        const guardadoFallback = await persistir(proformaId, {
          estado: 'error_reintentable',
          errores: ['No pude guardar el estado antes de enviar — reintentá'],
        })
        if (!guardadoFallback) {
          console.error(`informarVentaGocelular: no pude persistir el payload ni el estado de error para la proforma ${proformaId} — aborto el envío sin dejar rastro en gocelular`)
        }
        return { ok: false, estado: 'error_reintentable' }
      }
    }

    // 6. Enviar
    const res = await sendWholesaleWebhook(rawBody)

    // 7. Persistir resultado
    if (res.ok) {
      await persistir(proformaId, {
        estado: 'informado',
        saleId: res.body?.sale_id,
        faStatus: res.body?.fa_status,
        dispatchId: res.body?.dispatch?.id,
        numeroOrdenExterna: res.body?.dispatch?.numero_orden_externa,
        warnings: res.body?.warnings,
        enviadoAt: new Date().toISOString(),
        payloadEnviado: rawBody,
      })
      return { ok: true, estado: 'informado' }
    }

    if ((res.retryable || res.status === 0) && res.body?.code !== 'payload_too_large_local') {
      await persistir(proformaId, {
        estado: 'error_reintentable',
        codigoError: res.body?.code,
        errores: [res.body?.code === 'secret_no_configurado'
          ? 'Falta configurar GOCELULAR_WEBHOOK_SECRET'
          : `GOcelular no respondió (HTTP ${res.status}) tras 4 intentos — reintentá en unos minutos`],
        payloadEnviado: rawBody,
      })
      return { ok: false, estado: 'error_reintentable' }
    }

    // 4xx / 409: rechazado — parsear ambos envelopes (legacy {error,details} y nuevo {code,errors[]})
    const detalles: string[] = []
    if (Array.isArray(res.body?.errors)) {
      for (const e of res.body.errors as unknown[]) {
        if (e && typeof e === 'object') {
          const eo = e as Record<string, unknown>
          const partes = [eo.path, eo.line_reference, eo.sku, eo.imei].filter((v): v is string => typeof v === 'string' && v.length > 0)
          detalles.push(partes.length > 0 ? partes.join(' · ') : JSON.stringify(e))
        } else {
          detalles.push(String(e))
        }
      }
    } else if (typeof res.body?.details === 'string') {
      detalles.push(res.body.details)
    }

    const codigo = res.body?.code ?? res.body?.error ?? ''
    await persistir(proformaId, {
      estado: 'rechazado',
      codigoError: codigo || undefined,
      errores: [MENSAJES[codigo] ?? `GOcelular rechazó la venta (${codigo || 'HTTP ' + res.status})`, ...detalles],
      payloadEnviado: rawBody,
    })
    return { ok: false, estado: 'rechazado' }
  } finally {
    enviosEnCurso.delete(proformaId)
  }
}
