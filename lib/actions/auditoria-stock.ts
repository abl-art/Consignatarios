'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
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
    // Disponibles
    const dispRes = await client.query<{ model_name: string; qty: string }>(
      `SELECT COALESCE(dm.name, ii.model_code) AS model_name, COUNT(*)::text AS qty
       FROM inventory_items ii
       LEFT JOIN device_models dm ON dm.model_code = ii.model_code
       WHERE ii.status = 'available'
       GROUP BY model_name
       ORDER BY model_name`
    )

    // Pendientes de asignar: TODAS las ventas aprobadas sin dispositivo, sin importar el mes
    const pendRes = await client.query<{ product_name: string; pendientes: string }>(
      `SELECT so.product_name, COUNT(*)::text AS pendientes
       FROM store_orders so
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       WHERE go.order_status = 'approved'
         AND go.order_discarded_at IS NULL
         AND go.created_at <= ($1::date + interval '1 day')
         AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.order_id = go.order_id)
       GROUP BY so.product_name`,
      [fechaCorte]
    )

    // Match pendientes a modelos: normaliza nombre a brand-modelo-storage
    const noise = ['celular', 'telefono', 'libre', 'dual', 'sim', 'lte', '5g', '4g']
    const matchKey = (name: string): string => {
      let s = name.toLowerCase()
      s = s.replace(/\bmotorola\s+moto\b/, 'moto').replace(/\bmotorola\b/, 'moto')
      s = s.replace(/[\/\-\(\),]/g, ' ').replace(/gb/gi, '').replace(/\s+/g, ' ').trim()
      // Storage: mayor número >= 32
      const allNums = [...s.matchAll(/\b(\d+)\b/g)].map(m => Number(m[1]))
      const storage = allNums.filter(n => n >= 32 && n <= 1024).sort((a, b) => b - a)[0]?.toString() ?? ''
      // Samsung: solo código de modelo (A07, A15, S24, etc.) + storage
      if (s.includes('samsung')) {
        const modelCode = s.split(' ').find(t => /^[asmz]\d{1,3}$/i.test(t)) ?? ''
        return `samsung-${modelCode}-${storage}`
      }
      // Otros: nombre completo del modelo sin noise ni RAM
      const tokens = s.split(' ').filter(t => t.length > 0 && !noise.includes(t))
      const modelParts: string[] = []
      let seenStorage = false
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]
        if (/^\d+$/.test(t)) {
          const n = Number(t)
          if (n >= 32 && n <= 1024) {
            seenStorage = true
          } else if (n >= 2 && n <= 16) {
            const next = tokens[i + 1]
            if (seenStorage) continue
            if (next && /^\d+$/.test(next) && Number(next) >= 32) continue
            modelParts.push(t)
          } else if (!seenStorage) {
            modelParts.push(t)
          }
        } else {
          if (!seenStorage) modelParts.push(t)
        }
      }
      return `${modelParts.join('-')}-${storage}`
    }

    // Agrupar disponibles por matchKey (junta variantes del mismo modelo)
    const gruposDisp: Record<string, { nombre: string; qty: number }> = {}
    for (const r of dispRes.rows) {
      const key = matchKey(r.model_name)
      if (!gruposDisp[key]) {
        gruposDisp[key] = { nombre: r.model_name, qty: 0 }
      }
      gruposDisp[key].qty += Number(r.qty)
    }

    // Agrupar pendientes por matchKey
    const gruposPend: Record<string, { nombre: string; qty: number }> = {}
    for (const p of pendRes.rows) {
      const key = matchKey(p.product_name)
      if (!gruposPend[key]) {
        gruposPend[key] = { nombre: p.product_name, qty: 0 }
      }
      gruposPend[key].qty += Number(p.pendientes)
    }

    // Armar detalle unificado
    const allKeys = new Set([...Object.keys(gruposDisp), ...Object.keys(gruposPend)])
    const detalle: DetalleModelo[] = []
    for (const key of allKeys) {
      const disp = gruposDisp[key]
      const pend = gruposPend[key]
      const disponibles = disp?.qty ?? 0
      const pendientes = pend?.qty ?? 0
      const teorico = Math.max(0, disponibles - pendientes)
      const nombre = disp?.nombre ?? pend!.nombre
      const precioUnit = buscarPrecio(precios, nombre)
      if (disponibles === 0 && pendientes === 0) continue
      detalle.push({
        modelo: nombre,
        disponibles,
        pendientes,
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
