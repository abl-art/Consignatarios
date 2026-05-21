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
  // Merge profundo: por fecha, y dentro de cada fecha por todo.id
  // Así dos dispositivos pueden editar distintos items sin pisarse
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_todos').single()
    const existing: Record<string, { id: string; text: string; done: boolean; prioridad?: string }[]> = data?.value ? JSON.parse(data.value) : {}
    if (Array.isArray(existing)) return upsertConfig('app_todos', JSON.stringify(todos))
    const incoming = Array.isArray(todos) ? {} : todos as Record<string, { id: string; text: string; done: boolean; prioridad?: string }[]>

    const merged: Record<string, unknown> = { ...existing }
    for (const [fecha, items] of Object.entries(incoming)) {
      if (!Array.isArray(items)) { merged[fecha] = items; continue }
      const existingItems = Array.isArray(existing[fecha]) ? existing[fecha] : []
      // Crear mapa de items existentes por id
      const byId = new Map<string, typeof existingItems[0]>()
      for (const item of existingItems) { if (item?.id) byId.set(item.id, item) }
      // Aplicar items entrantes (agregar nuevos, actualizar existentes)
      for (const item of items) { if (item?.id) byId.set(item.id, item) }
      merged[fecha] = Array.from(byId.values())
    }
    return upsertConfig('app_todos', JSON.stringify(merged))
  } catch {
    return upsertConfig('app_todos', JSON.stringify(todos))
  }
}

export async function guardarNotas(texto: string): Promise<SaveResult> {
  return upsertConfig('app_notas', texto)
}

export async function guardarNotasGuardadas(notas: { id: string; titulo: string; texto: string; updatedAt: string }[]): Promise<SaveResult> {
  // Merge por id: preservar notas de otros dispositivos que este no tiene
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_notas_guardadas').single()
    const existing: { id: string; titulo: string; texto: string; updatedAt: string }[] = data?.value ? JSON.parse(data.value) : []
    // Mapa por id, existentes primero, incoming pisa por id
    const byId = new Map<string, typeof existing[0]>()
    for (const n of existing) byId.set(n.id, n)
    for (const n of notas) byId.set(n.id, n)
    return upsertConfig('app_notas_guardadas', JSON.stringify(Array.from(byId.values())))
  } catch {
    return upsertConfig('app_notas_guardadas', JSON.stringify(notas))
  }
}

export async function fetchNotasGuardadas(): Promise<{ id: string; titulo: string; texto: string; updatedAt: string }[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_notas_guardadas').single()
  if (!data?.value) return []
  return JSON.parse(data.value)
}

// Notas y metadata de eventos (key = event_id, value = {texto, color, done})
export async function guardarNotasEventos(notas: Record<string, { texto?: string; color?: string; done?: boolean }>): Promise<SaveResult> {
  // Merge por key: preservar eventos de otros dispositivos
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_notas_eventos').single()
    const existing = data?.value ? JSON.parse(data.value) : {}
    const merged = { ...existing, ...notas }
    return upsertConfig('app_notas_eventos', JSON.stringify(merged))
  } catch {
    return upsertConfig('app_notas_eventos', JSON.stringify(notas))
  }
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
