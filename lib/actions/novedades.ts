'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

export interface Novedad {
  id: string
  titulo: string
  detalle: string | null
  tipo: string | null
  referencia: string | null
  created_at: string
  leida_at: string | null
}

export async function getNovedades(limit = 30): Promise<Novedad[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('novedades_gocelular')
    .select('id, titulo, detalle, tipo, referencia, created_at, leida_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('getNovedades:', error.message)
    return []
  }
  return data ?? []
}

export async function marcarNovedadesLeidas(ids: string[]): Promise<{ ok: boolean }> {
  if (ids.length === 0) return { ok: true }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('novedades_gocelular')
    .update({ leida_at: new Date().toISOString() })
    .in('id', ids)
    .is('leida_at', null)
  if (error) {
    console.error('marcarNovedadesLeidas:', error.message)
    return { ok: false }
  }
  revalidatePath('/dashboard')
  return { ok: true }
}
