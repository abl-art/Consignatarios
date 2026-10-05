'use server'

// Cola de arrepentimientos (pestaña Arrepentimientos de /compras/envios).
// Confirmar reusa cargarRescate (motivo 'Arrepentimiento') → el rescate
// entra al flujo normal de la pestaña Rescates. Descartar es soft-delete:
// la fila queda para el dedupe del cron.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarRescate } from '@/lib/actions/rescates'
import { MOTIVOS_DESCARTE_ARREPENTIMIENTO } from '@/lib/arrepentimientos'

export interface SolicitudArrepentimiento {
  id: string
  dni: string
  nombre: string
  emailFecha: string
  orderNumber: string | null
  gocuotasOrderId: string | null
  producto: string | null
  tracking: string | null
  otrasOrdenes: number
  insistencias: number
  ultimaInsistenciaAt: string
  estado: 'pendiente' | 'confirmada' | 'descartada'
  descarteMotivo: string | null
  resueltoAt: string | null
}

export async function getArrepentimientos(): Promise<SolicitudArrepentimiento[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('arrepentimientos')
    .select('*')
    .order('email_fecha', { ascending: true })
  return (data ?? []).map(r => ({
    id: r.id,
    dni: r.dni,
    nombre: r.nombre,
    emailFecha: r.email_fecha,
    orderNumber: r.order_number,
    gocuotasOrderId: r.gocuotas_order_id,
    producto: r.producto,
    tracking: r.tracking,
    otrasOrdenes: r.otras_ordenes,
    insistencias: r.insistencias,
    ultimaInsistenciaAt: r.ultima_insistencia_at,
    estado: r.estado,
    descarteMotivo: r.descarte_motivo,
    resueltoAt: r.resuelto_at,
  }))
}

export async function confirmarArrepentimiento(id: string): Promise<{ ok?: true; error?: string }> {
  const admin = createAdminClient()
  const { data: fila } = await admin.from('arrepentimientos').select('tracking, estado').eq('id', id).single()
  if (!fila) return { error: 'Solicitud no encontrada.' }
  if (fila.estado !== 'pendiente') return { error: 'La solicitud ya fue resuelta.' }
  if (!fila.tracking) return { error: 'Sin despacho: no hay envío para rescatar — anulá la orden y descartá la solicitud.' }

  const res = await cargarRescate(fila.tracking, 'Arrepentimiento')
  if (res.error) return { error: res.error }

  const { error } = await admin
    .from('arrepentimientos')
    .update({ estado: 'confirmada', resuelto_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/compras/envios')
  return { ok: true }
}

export async function descartarArrepentimiento(id: string, motivo: string): Promise<{ ok?: true; error?: string }> {
  if (!(MOTIVOS_DESCARTE_ARREPENTIMIENTO as readonly string[]).includes(motivo)) {
    return { error: 'Elegí un motivo del desplegable.' }
  }
  const admin = createAdminClient()
  const { data: fila } = await admin.from('arrepentimientos').select('estado').eq('id', id).single()
  if (!fila) return { error: 'Solicitud no encontrada.' }
  if (fila.estado !== 'pendiente') return { error: 'La solicitud ya fue resuelta.' }

  const { error } = await admin
    .from('arrepentimientos')
    .update({ estado: 'descartada', descarte_motivo: motivo, resuelto_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/compras/envios')
  return { ok: true }
}
