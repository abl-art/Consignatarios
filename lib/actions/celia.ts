'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function exigirAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.rol !== 'admin') throw new Error('No autorizado')
}

export async function listarConversaciones() {
  await exigirAdmin()
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('celia_conversaciones')
    .select('id, titulo, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return data
}

export async function crearConversacion(primeraPregunta: string) {
  await exigirAdmin()
  const sb = createAdminClient()
  const titulo = primeraPregunta.trim().slice(0, 60) || 'Nueva conversación'
  const { data, error } = await sb
    .from('celia_conversaciones')
    .insert({ titulo })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function obtenerMensajes(conversacionId: string) {
  await exigirAdmin()
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('celia_mensajes')
    .select('id, role, content, created_at')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data as { id: string; role: 'user' | 'assistant'; content: unknown; created_at: string }[]
}

export async function borrarConversacion(conversacionId: string) {
  await exigirAdmin()
  const sb = createAdminClient()
  const { error } = await sb.from('celia_conversaciones').delete().eq('id', conversacionId)
  if (error) throw new Error(error.message)
}
