'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { EstadoLiquidacion } from '@/lib/types'

export async function generarBorradorLiquidacion(input: {
  fechaInicio: string  // YYYY-MM-DD
  fechaFin: string     // YYYY-MM-DD
}) {
  const supabase = createClient()
  const { fechaInicio, fechaFin } = input

  // Derivar etiqueta del mes (para display)
  const mes = fechaInicio.slice(0, 7)

  // Cargar ventas del período
  const { data: ventas } = await supabase
    .from('ventas')
    .select('consignatario_id, comision_monto')
    .gte('fecha_venta', fechaInicio)
    .lte('fecha_venta', fechaFin)

  // Cargar diferencias pendientes
  const { data: diferencias } = await supabase
    .from('diferencias')
    .select('monto_deuda, auditorias(consignatario_id)')
    .eq('estado', 'pendiente')

  // Agregar comisiones por consignatario
  const comisionesPorC: Record<string, number> = {}
  for (const v of ventas ?? []) {
    comisionesPorC[v.consignatario_id] = (comisionesPorC[v.consignatario_id] ?? 0) + (v.comision_monto ?? 0)
  }

  // Agregar diferencias por consignatario
  type DifRow = { monto_deuda: number; auditorias: { consignatario_id: string } | null }
  const difPorC: Record<string, number> = {}
  for (const d of ((diferencias ?? []) as unknown as DifRow[])) {
    const cid = d.auditorias?.consignatario_id
    if (!cid) continue
    difPorC[cid] = (difPorC[cid] ?? 0) + (d.monto_deuda ?? 0)
  }

  let creadas = 0
  let errores = 0
  for (const [cid, comisiones] of Object.entries(comisionesPorC)) {
    const dif = difPorC[cid] ?? 0
    const { error } = await supabase.from('liquidaciones').insert({
      consignatario_id: cid,
      mes,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      total_comisiones: comisiones,
      total_diferencias_descontadas: dif,
      monto_a_pagar: Math.max(0, comisiones - dif),
      estado: 'borrador',
    })
    if (error) {
      if (error.code !== '23505') errores++
    } else {
      creadas++
    }
  }

  revalidatePath('/liquidaciones')
  revalidatePath('/dashboard')
  return { ok: true, creadas, errores }
}

export async function confirmarLiquidacion(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('liquidaciones')
    .update({ estado: 'pendiente' })
    .eq('id', id)
    .eq('estado', 'borrador')
  if (error) return { error: error.message }
  revalidatePath('/liquidaciones')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function eliminarLiquidacion(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('liquidaciones')
    .delete()
    .eq('id', id)
    .eq('estado', 'borrador')
  if (error) return { error: error.message }
  revalidatePath('/liquidaciones')
  revalidatePath('/dashboard')
  return { ok: true }
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
