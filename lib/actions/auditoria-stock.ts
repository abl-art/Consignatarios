'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { Client } from 'pg'
import { revalidatePath } from 'next/cache'
import { getMejorPrecio } from './compras'
import { buscarPrecio } from '@/lib/utils'

export interface DetalleModelo {
  modelo: string
  disponibles: number
  pendientes: number
  teorico: number // disponibles - pendientes
  real: number // conteo manual
  diferencia: number // real - teorico
  precio_unit: number
  valor_teorico: number
  valor_real: number
  valor_diferencia: number
}

export interface AuditoriaStockPropio {
  id: string
  fecha_corte: string
  fecha_conteo: string | null
  estado: 'pendiente' | 'en_conteo' | 'firmada'
  detalle: DetalleModelo[]
  total_teorico: number
  total_real: number
  total_diferencia: number
  valor_existencia_final: number
  firma_responsable: string | null
  firma_responsable_url: string | null
  firma_supervisor: string | null
  firma_supervisor_url: string | null
  observaciones: string | null
  created_at: string
}

// Generar planilla con stock teórico del último día del mes
export async function generarPlanilla(mesAnio: string): Promise<{ ok: true; id: string } | { error: string }> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return { error: 'GOCELULAR_DB_URL no configurada' }

  // Calcular último día del mes
  const [anio, mes] = mesAnio.split('-').map(Number)
  const ultimoDia = new Date(anio, mes, 0)
  const fechaCorte = ultimoDia.toISOString().slice(0, 10)

  // Verificar si ya existe para este mes
  const sb = createAdminClient()
  const { data: existente } = await sb.from('auditorias_stock_propio').select('id').eq('fecha_corte', fechaCorte).single()
  if (existente) return { error: `Ya existe una auditoría para ${mesAnio}` }

  const precios = await getMejorPrecio()

  // Consultar GOcelular: disponibles y pendientes por modelo
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    // Disponibles
    const dispRes = await client.query<{ model_name: string; qty: string }>(
      `SELECT COALESCE(dm.name, ii.model_code) AS model_name, COUNT(*)::text AS qty
       FROM inventory_items ii
       LEFT JOIN device_models dm ON dm.model_code = ii.model_code
       WHERE ii.status = 'available'
       GROUP BY model_name
       ORDER BY model_name`
    )

    // Pendientes de asignar
    const pendRes = await client.query<{ product_name: string; pendientes: string }>(
      `SELECT so.product_name, COUNT(*)::text AS pendientes
       FROM store_orders so
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       WHERE so.status = 'paid'
         AND so.cancelled_at IS NULL
         AND go.order_discarded_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.order_id = go.order_id)
         AND NOT EXISTS (SELECT 1 FROM inventory_items ii WHERE ii.assigned_to_order_id = go.order_id AND ii.status = 'assigned')
       GROUP BY so.product_name`
    )

    // Match pendientes a modelos usando el mismo matchKey
    const matchKey = (name: string): string => {
      const lower = name.toLowerCase()
      const brand = lower.includes('samsung') ? 'samsung' : (lower.includes('motorola') || lower.includes('moto')) ? 'motorola' : 'other'
      const modelMatch = lower.match(/[ga]\d{2,3}/i)
      const model = modelMatch ? modelMatch[0].toLowerCase() : ''
      const allNumbers = [...lower.matchAll(/(\d+)/g)].map(m => Number(m[1])).filter(n => n >= 32 && n <= 1024)
      const storage = allNumbers.length > 0 ? Math.max(...allNumbers).toString() : ''
      return `${brand}-${model}-${storage}`
    }

    const pendPorModelo: Record<string, number> = {}
    for (const p of pendRes.rows) {
      for (const d of dispRes.rows) {
        if (matchKey(p.product_name) === matchKey(d.model_name)) {
          pendPorModelo[d.model_name] = (pendPorModelo[d.model_name] ?? 0) + Number(p.pendientes)
          break
        }
      }
    }

    // Armar detalle
    const detalle: DetalleModelo[] = dispRes.rows.map(r => {
      const disponibles = Number(r.qty)
      const pendientes = pendPorModelo[r.model_name] ?? 0
      const teorico = Math.max(0, disponibles - pendientes)
      const precioUnit = buscarPrecio(precios, r.model_name)
      return {
        modelo: r.model_name,
        disponibles,
        pendientes,
        teorico,
        real: 0,
        diferencia: 0,
        precio_unit: precioUnit,
        valor_teorico: teorico * precioUnit,
        valor_real: 0,
        valor_diferencia: 0,
      }
    }).filter(d => d.teorico > 0 || d.disponibles > 0)

    const totalTeorico = detalle.reduce((s, d) => s + d.valor_teorico, 0)

    const { data: row, error } = await sb.from('auditorias_stock_propio').insert({
      fecha_corte: fechaCorte,
      estado: 'pendiente',
      detalle: JSON.stringify(detalle),
      total_teorico: totalTeorico,
    }).select('id').single()

    if (error) return { error: error.message }
    revalidatePath('/auditoria-stock')
    return { ok: true, id: row.id }
  } finally {
    await client.end()
  }
}

export async function fetchAuditorias(): Promise<AuditoriaStockPropio[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('auditorias_stock_propio').select('*').order('fecha_corte', { ascending: false })
  if (!data) return []
  return data.map(r => ({
    ...r,
    detalle: typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle,
    total_teorico: Number(r.total_teorico),
    total_real: Number(r.total_real),
    total_diferencia: Number(r.total_diferencia),
    valor_existencia_final: Number(r.valor_existencia_final),
  })) as AuditoriaStockPropio[]
}

export async function guardarConteo(id: string, detalle: DetalleModelo[], observaciones: string) {
  const sb = createAdminClient()
  const totalReal = detalle.reduce((s, d) => s + d.valor_real, 0)
  const totalDiferencia = detalle.reduce((s, d) => s + d.valor_diferencia, 0)
  const valorExistenciaFinal = totalReal

  const { error } = await sb.from('auditorias_stock_propio').update({
    detalle: JSON.stringify(detalle),
    estado: 'en_conteo',
    fecha_conteo: new Date().toISOString().slice(0, 10),
    total_real: totalReal,
    total_diferencia: totalDiferencia,
    valor_existencia_final: valorExistenciaFinal,
    observaciones,
  }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/auditoria-stock')
  return { ok: true }
}

export async function firmarAuditoria(id: string, firmaResponsable: string, firmaResponsableUrl: string, firmaSupervisor: string, firmaSupervisorUrl: string) {
  const sb = createAdminClient()
  const { error } = await sb.from('auditorias_stock_propio').update({
    estado: 'firmada',
    firma_responsable: firmaResponsable,
    firma_responsable_url: firmaResponsableUrl,
    firma_supervisor: firmaSupervisor,
    firma_supervisor_url: firmaSupervisorUrl,
  }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/auditoria-stock')
  return { ok: true }
}
