'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function guardarTodos(todos: Record<string, unknown> | { id: string; text: string; done: boolean }[]) {
  const sb = createAdminClient()
  await sb.from('flujo_config').upsert({
    key: 'app_todos',
    value: JSON.stringify(todos),
    updated_at: new Date().toISOString(),
  })
}

export async function guardarNotas(texto: string) {
  const sb = createAdminClient()
  await sb.from('flujo_config').upsert({
    key: 'app_notas',
    value: texto,
    updated_at: new Date().toISOString(),
  })
}

export async function guardarNotasGuardadas(notas: { id: string; titulo: string; texto: string; updatedAt: string }[]) {
  const sb = createAdminClient()
  await sb.from('flujo_config').upsert({
    key: 'app_notas_guardadas',
    value: JSON.stringify(notas),
    updated_at: new Date().toISOString(),
  })
}

export async function fetchNotasGuardadas(): Promise<{ id: string; titulo: string; texto: string; updatedAt: string }[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_notas_guardadas').single()
  if (!data?.value) return []
  return JSON.parse(data.value)
}

// Notas privadas de eventos (key = event_id, value = texto)
export async function guardarNotasEventos(notas: Record<string, string>) {
  const sb = createAdminClient()
  await sb.from('flujo_config').upsert({
    key: 'app_notas_eventos',
    value: JSON.stringify(notas),
    updated_at: new Date().toISOString(),
  })
}

export async function fetchNotasEventos(): Promise<Record<string, string>> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_notas_eventos').single()
  if (!data?.value) return {}
  return JSON.parse(data.value)
}
