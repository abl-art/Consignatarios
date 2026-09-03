'use server'

// Carga manual de rescates para la pestaña Rescates de /compras/envios.
// Un rescate cargado a mano (tracking + motivo) arranca como "Pendiente de
// aceptación"; cuando la SolicitudDeRescate aparece en shipments.traces por
// API, la fila se engancha con el flujo automático (aporta solo el motivo) y
// el estado avanza solo. Mismo patrón que los siniestros.

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { fetchRescates, fetchEnviosPorTracking } from '@/lib/gocelular'
import {
  armarRescatesManuales,
  MOTIVOS_RESCATE,
  type Rescate,
  type SeguimientoRescate,
} from '@/lib/rescates'

async function getSeguimientos(): Promise<SeguimientoRescate[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('rescates_seguimiento').select('tracking, motivo, created_at')
  return (data ?? []).map(r => ({ tracking: r.tracking, motivo: r.motivo, createdAt: r.created_at }))
}

/**
 * Rescates detectados en el tracking de Andreani + los cargados a mano que
 * todavía no aparecen ahí (Pendientes de aceptación), con su motivo.
 */
export async function getRescatesCompletos(): Promise<Rescate[]> {
  const ahora = new Date()
  const seguimientos = await getSeguimientos()
  const autos = await fetchRescates(ahora, seguimientos)
  const yaListados = new Set(autos.map(r => r.tracking).filter((t): t is string => t !== null))
  const faltantes = seguimientos.filter(s => !yaListados.has(s.tracking)).map(s => s.tracking)
  const manualesRaw = await fetchEnviosPorTracking(faltantes)
  const manuales = armarRescatesManuales(manualesRaw, seguimientos, ahora, yaListados)
  return [...manuales, ...autos]
}

export async function cargarRescate(tracking: string, motivo: string): Promise<{ ok?: true; error?: string }> {
  const t = tracking.trim()
  if (!t) return { error: 'Ingresá un número de envío.' }
  if (!(MOTIVOS_RESCATE as readonly string[]).includes(motivo)) {
    return { error: 'Elegí un motivo del desplegable.' }
  }

  const envios = await fetchEnviosPorTracking([t])
  if (envios.length === 0) {
    return { error: `No se encontró ningún envío con tracking ${t} en GOcelular.` }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('rescates_seguimiento')
    .upsert({ tracking: t, motivo, updated_at: new Date().toISOString() }, { onConflict: 'tracking' })
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}

/** Cambia (o asigna) el motivo de un rescate ya listado, por tracking. */
export async function setMotivoRescate(tracking: string, motivo: string): Promise<{ ok?: true; error?: string }> {
  if (motivo && !(MOTIVOS_RESCATE as readonly string[]).includes(motivo)) {
    return { error: 'Motivo inválido' }
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('rescates_seguimiento')
    .upsert({ tracking, motivo: motivo || null, updated_at: new Date().toISOString() }, { onConflict: 'tracking' })
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}
