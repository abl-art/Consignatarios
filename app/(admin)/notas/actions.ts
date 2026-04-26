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
