'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { EstadoLiquidacion } from '@/lib/types'

export async function generarLiquidacionesDelMes(mes: string) {
  // mes format: YYYY-MM
  const supabase = createClient()

  // Compute first and last day of month
  const inicioMes = `${mes}-01`
  const [year, month] = mes.split('-').map(Number)
  const finMes = new Date(year, month, 0).toISOString().split('T')[0] // last day of month

  // Load ventas for the month
  const { data: ventas } = await supabase
    .from('ventas')
    .select('consignatario_id, comision_monto')
    .gte('fecha_venta', inicioMes)
    .lte('fecha_venta', finMes)

  // Load pending diferencias with consignatario_id via auditorias join
  const { data: diferencias } = await supabase
    .from('diferencias')
    .select('monto_deuda, auditorias(consignatario_id)')
    .eq('estado', 'pendiente')

  // Aggregate commissions by consignatario
  const comisionesPorC: Record<string, number> = {}
  for (const v of ventas ?? []) {
    comisionesPorC[v.consignatario_id] = (comisionesPorC[v.consignatario_id] ?? 0) + (v.comision_monto ?? 0)
  }

  // Aggregate pending differences by consignatario (via auditorias)
  type DifRow = { monto_deuda: number; auditorias: { consignatario_id: string } | null }
  const difPorC: Record<string, number> = {}
  for (const d of ((diferencias ?? []) as unknown as DifRow[])) {
    const cid = d.auditorias?.consignatario_id
    if (!cid) continue
    difPorC[cid] = (difPorC[cid] ?? 0) + (d.monto_deuda ?? 0)
  }

  // Insert liquidaciones (skip duplicates — unique constraint consignatario_id+mes)
  let creadas = 0
  let errores = 0
  for (const [cid, comisiones] of Object.entries(comisionesPorC)) {
    const dif = difPorC[cid] ?? 0
    const { error } = await supabase.from('liquidaciones').insert({
      consignatario_id: cid,
      mes,
      total_comisiones: comisiones,
      total_diferencias_descontadas: dif,
      monto_a_pagar: Math.max(0, comisiones - dif),
      estado: 'retenida',
    })
    if (error) {
      // unique violation means liquidation already exists — don't count as error
      if (error.code !== '23505') errores++
    } else {
      creadas++
    }
  }

  revalidatePath('/liquidaciones')
  revalidatePath('/dashboard')
  return { ok: true, creadas, errores }
}

export async function actualizarEstadoLiquidacion(id: string, estado: EstadoLiquidacion) {
  const supabase = createClient()
  const updates: { estado: EstadoLiquidacion; fecha_pago?: string } = { estado }
  if (estado === 'pagada') {
    updates.fecha_pago = new Date().toISOString().split('T')[0]
  }
  const { error } = await supabase.from('liquidaciones').update(updates).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/liquidaciones')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function autoBloquearRetenidas() {
  // Auto-transition: if estado='retenida' and created_at > 5 days ago → bloqueada
  const supabase = createClient()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 5)
  const cutoffIso = cutoff.toISOString()

  await supabase
    .from('liquidaciones')
    .update({ estado: 'bloqueada' })
    .eq('estado', 'retenida')
    .lt('created_at', cutoffIso)
}
