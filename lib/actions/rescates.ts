'use server'

// Carga manual de rescates para la pestaña Rescates de /compras/envios.
// Un rescate cargado a mano (tracking + motivo) arranca como "Pendiente de
// aceptación"; cuando la SolicitudDeRescate aparece en shipments.traces por
// API, la fila se engancha con el flujo automático (aporta solo el motivo) y
// el estado avanza solo. Mismo patrón que los siniestros.

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { fetchRescates, fetchEnviosPorTracking } from '@/lib/gocelular'
import { getCancelacionEstado } from '@/lib/gocelular-webhook'
import {
  armarRescatesManuales,
  MOTIVOS_RESCATE,
  type Rescate,
  type SeguimientoRescate,
} from '@/lib/rescates'

/** Rescate + la segunda fuente: el bloque `rescate` del GET de Pedro (contrato 29/10). */
export type RescateConPedro = Rescate & {
  pedroEstado: string | null
  pedroRazon: string | null
}

async function getSeguimientos(): Promise<SeguimientoRescate[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('rescates_seguimiento').select('tracking, motivo, created_at, resuelto_at')
  return (data ?? []).map(r => ({ tracking: r.tracking, motivo: r.motivo, createdAt: r.created_at, resueltoAt: r.resuelto_at }))
}

/**
 * Rescates detectados en el tracking de Andreani + los cargados a mano que
 * todavía no aparecen ahí (Pendientes de aceptación), con su motivo y la
 * segunda fuente de Pedro (solo filas sin resolver con orden — las resueltas
 * no gastan requests; Pedro informa rescates pedidos desde el 28/10/2026,
 * las anteriores vienen null).
 */
export async function getRescatesCompletos(): Promise<RescateConPedro[]> {
  const ahora = new Date()
  const seguimientos = await getSeguimientos()
  const autos = await fetchRescates(ahora, seguimientos)
  const yaListados = new Set(autos.map(r => r.tracking).filter((t): t is string => t !== null))
  const faltantes = seguimientos.filter(s => !yaListados.has(s.tracking)).map(s => s.tracking)
  const manualesRaw = await fetchEnviosPorTracking(faltantes)
  const manuales = armarRescatesManuales(manualesRaw, seguimientos, ahora, yaListados)
  const todos = [...manuales, ...autos]
  return Promise.all(
    todos.map(async (r): Promise<RescateConPedro> => {
      if (r.resueltoAt || !r.orderNumber) return { ...r, pedroEstado: null, pedroRazon: null }
      try {
        const { body } = await getCancelacionEstado({ order_number: r.orderNumber })
        return { ...r, pedroEstado: body?.rescate?.estado ?? null, pedroRazon: body?.rescate?.razon ?? null }
      } catch {
        return { ...r, pedroEstado: null, pedroRazon: null }
      }
    }),
  )
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

/**
 * Marca (o desmarca) un rescate como resuelto, por tracking. Ningún rescate se
 * resuelve solo — ni siquiera rendido —: Yami confirma que el equipo apareció
 * en el depósito (o que el caso quedó gestionado) con el botón Resolver. El
 * upsert crea la fila de seguimiento si el rescate era solo automático.
 */
export async function setRescateResuelto(tracking: string, resuelto: boolean): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('rescates_seguimiento')
    .upsert(
      { tracking, resuelto_at: resuelto ? new Date().toISOString() : null, updated_at: new Date().toISOString() },
      { onConflict: 'tracking' }
    )
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
