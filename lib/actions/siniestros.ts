'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { fetchSiniestros, fetchEnviosPorTracking } from '@/lib/gocelular'
import {
  armarSiniestrosManuales,
  ordenarSiniestros,
  type SeguimientoSiniestro,
  type Siniestro,
} from '@/lib/siniestros'

async function getSeguimientos(): Promise<SeguimientoSiniestro[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('siniestros_seguimiento')
    .select('tracking, nota_credito, created_at')
  return (data ?? []).map(r => ({
    tracking: r.tracking,
    notaCredito: r.nota_credito,
    createdAt: r.created_at,
  }))
}

/**
 * Siniestros detectados en el tracking de Andreani + los cargados a mano
 * (siniestros_seguimiento en Supabase), con el tilde de nota de crédito.
 */
export async function getSiniestrosCompletos(): Promise<Siniestro[]> {
  const ahora = new Date()
  const seguimientos = await getSeguimientos()
  const autos = await fetchSiniestros(ahora, seguimientos)
  const yaListados = new Set(autos.map(s => s.tracking).filter((t): t is string => t !== null))
  const faltantes = seguimientos.filter(s => !yaListados.has(s.tracking)).map(s => s.tracking)
  const manualesRaw = await fetchEnviosPorTracking(faltantes)
  const manuales = armarSiniestrosManuales(manualesRaw, ahora, seguimientos, yaListados)
  return ordenarSiniestros([...autos, ...manuales])
}

export async function cargarSiniestro(tracking: string): Promise<{ ok?: true; error?: string }> {
  const t = tracking.trim()
  if (!t) return { error: 'Ingresá un número de envío.' }

  const envios = await fetchEnviosPorTracking([t])
  if (envios.length === 0) {
    return { error: `No se encontró ningún envío con tracking ${t} en GOcelular.` }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('siniestros_seguimiento')
    .upsert({ tracking: t }, { onConflict: 'tracking', ignoreDuplicates: true })
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}

export async function setNotaCredito(tracking: string, emitida: boolean): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('siniestros_seguimiento')
    .upsert(
      { tracking, nota_credito: emitida, nota_credito_at: emitida ? new Date().toISOString() : null },
      { onConflict: 'tracking' }
    )
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}
