'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import { revalidatePath } from 'next/cache'
import { getMejorPrecio } from './compras'
import { buscarPrecio } from '@/lib/utils'

export interface DetalleModelo {
  modelo: string
  teorico: number // stock disponible en sistema
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
  const { data: existente } = await sb.from('auditorias_stock_propio').select('id, estado').eq('fecha_corte', fechaCorte).single()
  if (existente) {
    if (existente.estado !== 'pendiente') return { error: `Ya existe una auditoría para ${mesAnio} en estado "${existente.estado}"` }
    // Reemplazar planilla pendiente (permite regenerar tras correcciones)
    await sb.from('auditorias_stock_propio').delete().eq('id', existente.id)
  }

  const precios = await getMejorPrecio()

  // Consultar GOcelular: disponibles y pendientes por modelo
  const pool = getPool()
  if (!pool) return { error: 'GOCELULAR_DB_URL no configurada' }
  const client = await pool.connect()
  try {
    // Stock disponible por modelo
    const dispRes = await client.query<{ model_name: string; qty: string }>(
      `SELECT COALESCE(dm.name, ii.model_code) AS model_name, COUNT(*)::text AS qty
       FROM inventory_items ii
       LEFT JOIN device_models dm ON dm.model_code = ii.model_code
       WHERE ii.status = 'available'
       GROUP BY model_name
       ORDER BY model_name`
    )

    // Armar detalle: teórico = disponibles (sin descontar pendientes)
    const detalle: DetalleModelo[] = []
    for (const r of dispRes.rows) {
      const teorico = Number(r.qty)
      if (teorico === 0) continue
      const precioUnit = buscarPrecio(precios, r.model_name)
      detalle.push({
        modelo: r.model_name,
        teorico,
        real: 0,
        diferencia: 0,
        precio_unit: precioUnit,
        valor_teorico: teorico * precioUnit,
        valor_real: 0,
        valor_diferencia: 0,
      })
    }

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
    client.release()
  }
}

export async function eliminarPlanilla(id: string): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  const { data } = await sb.from('auditorias_stock_propio').select('estado').eq('id', id).single()
  if (!data) return { error: 'Auditoría no encontrada' }
  if (data.estado !== 'pendiente') return { error: 'Solo se pueden eliminar auditorías en estado pendiente' }
  const { error } = await sb.from('auditorias_stock_propio').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/auditoria-stock')
  return { ok: true }
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
