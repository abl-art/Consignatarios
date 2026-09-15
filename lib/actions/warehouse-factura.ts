'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import {
  conciliarOutWarehouse,
  controlOutPedidos,
  type FacturaWarehouseParseada,
  type ConceptoFactura,
} from '@/lib/warehouse-factura'

export interface FacturaWarehouse {
  id: string
  periodo: string
  fecha_factura: string
  total_facturado: number
  conceptos: ConceptoFactura[]
  unidades_out: number
  ordenes_out: number
  bultos_in: number
  unidades_in: number
  recepciones: number
  valor_pico_seguro: number | null
  fecha_pico_seguro: string | null
  seguro_diario: { fecha: string; valor: number }[] | null
  out_conciliadas: number
  out_revisar: number
  /** Pedidos expedidos según la base de GOcelular en el período (control OUT) */
  pedidos_gocelular: number | null
  out_correcto: number | null
  out_sobrefacturado: number | null
  total_correcto: number | null
}

export async function getFacturasWarehouse(): Promise<FacturaWarehouse[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('facturas_warehouse')
    .select('*')
    .order('periodo', { ascending: false })
    .returns<FacturaWarehouse[]>()
  return data ?? []
}

export interface OutRevisar {
  orden: string
  unidades: number
  fecha_envio: string | null
  motivo: string | null
}

/** Órdenes facturadas por Andreani sin expedición confirmada en GOcelular. */
export async function getOutRevisar(facturaId: string): Promise<OutRevisar[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('facturas_warehouse_out')
    .select('orden, unidades, fecha_envio, motivo')
    .eq('factura_id', facturaId)
    .eq('estado', 'revisar')
    .order('orden')
    .returns<OutRevisar[]>()
  return data ?? []
}

/**
 * Estado real en GOcelular de cada orden facturada: 'expedido' si el pedido
 * de warehouse (no cancelado) está expedido; otro estado o 'sin_pedido_wh' si
 * la orden existe sin pedido activo; las que no aparecen no existen.
 */
async function fetchEstadoOrdenes(ordenes: string[]): Promise<Map<string, string>> {
  const pool = getPool()
  const estados = new Map<string, string>()
  if (!pool || ordenes.length === 0) return estados

  const client = await pool.connect()
  try {
    const res = await client.query<{ order_number: string; estado: string | null }>(
      `SELECT so.order_number, p.estado::text
       FROM store_orders so
       LEFT JOIN andreani_wh_pedidos p ON p.store_order_id = so.id AND p.estado <> 'cancelled'
       WHERE so.order_number = ANY($1)`,
      [ordenes],
    )
    for (const r of res.rows) {
      const previo = estados.get(r.order_number)
      // Una orden puede tener más de un pedido de WH: si alguno está expedido, vale ese
      if (previo !== 'expedido') estados.set(r.order_number, r.estado ?? 'sin_pedido_wh')
    }
  } finally {
    client.release()
  }
  return estados
}

/** Pedidos expedidos según GOcelular dentro del mes del período ('YYYY-MM'). */
async function fetchPedidosExpedidos(periodo: string): Promise<number | null> {
  const pool = getPool()
  if (!pool) return null
  const [y, m] = periodo.split('-').map(Number)
  const desde = `${periodo}-01`
  const hasta = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
  const client = await pool.connect()
  try {
    const res = await client.query<{ pedidos: string }>(
      `SELECT COUNT(*)::text AS pedidos
       FROM andreani_wh_pedidos
       WHERE estado = 'expedido' AND updated_at >= $1 AND updated_at < $2`,
      [desde, hasta],
    )
    return Number(res.rows[0]?.pedidos ?? 0)
  } finally {
    client.release()
  }
}

export async function guardarFacturaWarehouse(parseada: FacturaWarehouseParseada, fechaFactura: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaFactura)) return { error: 'Fecha de factura inválida' }

  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('facturas_warehouse')
    .select('id')
    .eq('periodo', parseada.periodo)
    .maybeSingle()
  if (existing) return { error: `La factura del período ${parseada.periodo} ya fue cargada` }

  // Conciliar OUT contra los expedidos reales de GOcelular
  const ordenes = [...new Set(parseada.out.map(r => r.orden))]
  const [estadoPorOrden, pedidosGocelular] = await Promise.all([
    fetchEstadoOrdenes(ordenes),
    fetchPedidosExpedidos(parseada.periodo),
  ])
  const { filas, conciliadas, revisar } = conciliarOutWarehouse(parseada.out, estadoPorOrden)

  // Control OUT: la preparación se cobra por pedido expedido (base GOcelular),
  // no por artículo como la factura Andreani
  const control = controlOutPedidos(parseada.conceptos, parseada.totalFacturado, pedidosGocelular ?? 0)

  const { data: factura, error: facturaError } = await supabase
    .from('facturas_warehouse')
    .insert({
      periodo: parseada.periodo,
      fecha_factura: fechaFactura,
      total_facturado: parseada.totalFacturado,
      conceptos: parseada.conceptos,
      unidades_out: parseada.unidadesOut,
      ordenes_out: parseada.ordenesOut,
      bultos_in: parseada.bultosIn,
      unidades_in: parseada.unidadesIn,
      recepciones: parseada.ingresos.length,
      valor_pico_seguro: parseada.valorPicoSeguro,
      fecha_pico_seguro: parseada.fechaPicoSeguro,
      seguro_diario: parseada.seguroDiario,
      out_conciliadas: conciliadas,
      out_revisar: revisar,
      pedidos_gocelular: pedidosGocelular,
      out_correcto: control?.outCorrecto ?? null,
      out_sobrefacturado: control?.sobrefacturado ?? null,
      total_correcto: control?.totalCorrecto ?? null,
    })
    .select('id')
    .single()
  if (facturaError || !factura) return { error: facturaError?.message ?? 'Error al guardar la factura' }

  const batchSize = 500
  for (let i = 0; i < filas.length; i += batchSize) {
    const batch = filas.slice(i, i + batchSize).map(f => ({
      factura_id: factura.id,
      orden: f.orden,
      sku: f.sku || null,
      unidades: f.unidades,
      fecha_envio: f.fechaEnvio,
      estado: f.estado,
      motivo: f.motivo,
    }))
    const { error } = await supabase.from('facturas_warehouse_out').insert(batch)
    if (error) return { error: `Error al guardar el detalle OUT: ${error.message}` }
  }

  if (parseada.ingresos.length > 0) {
    const { error } = await supabase.from('facturas_warehouse_in').insert(
      parseada.ingresos.map(r => ({
        factura_id: factura.id,
        fecha: r.fecha,
        proveedor: r.proveedor || null,
        remito: r.remito || null,
        pallets: r.pallets,
        bultos: r.bultos,
        unidades: r.unidades,
      })),
    )
    if (error) return { error: `Error al guardar las recepciones IN: ${error.message}` }
  }

  // Egreso en flujo de fondos: total + 21% IVA, a 30 días de la fecha de factura
  // (misma regla de pago que la factura de distribución)
  const vto = new Date(fechaFactura + 'T00:00:00')
  vto.setDate(vto.getDate() + 30)
  await supabase.from('flujo_egresos').insert({
    flujo_dia: vto.toISOString().slice(0, 10),
    concepto: 'Warehouse Andreani',
    medio_de_pago: 'Transferencia',
    cuotas: 1,
    monto: Math.round(parseada.totalFacturado * 1.21 * 100) / 100,
  })

  revalidatePath('/compras/envios')
  revalidatePath('/finanzas')
  return {
    ok: true,
    facturaId: factura.id as string,
    conciliadas,
    revisar,
    pedidosGocelular,
    sobrefacturado: control?.sobrefacturado ?? null,
  }
}

export async function eliminarFacturaWarehouse(id: string) {
  const supabase = createAdminClient()
  await supabase.from('facturas_warehouse').delete().eq('id', id)
  revalidatePath('/compras/envios')
}
