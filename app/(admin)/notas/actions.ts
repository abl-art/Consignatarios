'use server'

import { createAdminClient } from '@/lib/supabase/admin'

type SaveResult = { ok: true } | { ok: false; error: string }

async function upsertConfig(key: string, value: string): Promise<SaveResult> {
  try {
    const sb = createAdminClient()
    const { error } = await sb.from('flujo_config').upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function fetchTodos(): Promise<Record<string, unknown>> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_todos').single()
  if (!data?.value) return {}
  const raw = JSON.parse(data.value)
  return Array.isArray(raw) ? {} : raw
}

export async function guardarTodos(todos: Record<string, unknown> | { id: string; text: string; done: boolean }[]): Promise<SaveResult> {
  // Merge con datos existentes para no sobrescribir semanas que este cliente no tiene cargadas
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_todos').single()
    const existing = data?.value ? JSON.parse(data.value) : {}
    const incoming = Array.isArray(todos) ? {} : todos
    // Merge: incoming keys overwrite existing, pero existing keys no presentes en incoming se mantienen
    const merged = { ...existing, ...incoming }
    return upsertConfig('app_todos', JSON.stringify(merged))
  } catch {
    return upsertConfig('app_todos', JSON.stringify(todos))
  }
}

export async function guardarNotas(texto: string): Promise<SaveResult> {
  return upsertConfig('app_notas', texto)
}

export async function guardarNotasGuardadas(notas: { id: string; titulo: string; texto: string; updatedAt: string }[]): Promise<SaveResult> {
  return upsertConfig('app_notas_guardadas', JSON.stringify(notas))
}

export async function fetchNotasGuardadas(): Promise<{ id: string; titulo: string; texto: string; updatedAt: string }[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_notas_guardadas').single()
  if (!data?.value) return []
  return JSON.parse(data.value)
}

// Notas y metadata de eventos (key = event_id, value = {texto, color, done})
export async function guardarNotasEventos(notas: Record<string, { texto?: string; color?: string; done?: boolean }>): Promise<SaveResult> {
  return upsertConfig('app_notas_eventos', JSON.stringify(notas))
}

export async function fetchNotasEventos(): Promise<Record<string, { texto?: string; color?: string; done?: boolean }>> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_notas_eventos').single()
  if (!data?.value) return {}
  const raw = JSON.parse(data.value)
  // Compatibilidad: strings viejos → objeto
  const result: Record<string, { texto?: string; color?: string; done?: boolean }> = {}
  for (const [k, v] of Object.entries(raw)) {
    result[k] = typeof v === 'string' ? { texto: v } : (v as { texto?: string; color?: string; done?: boolean })
  }
  return result
}
