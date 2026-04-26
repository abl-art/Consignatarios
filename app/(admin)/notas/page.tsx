export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import NotasClient from './NotasClient'

async function getData() {
  const sb = createAdminClient()
  const [{ data: todosRow }, { data: notasRow }] = await Promise.all([
    sb.from('flujo_config').select('value').eq('key', 'app_todos').single(),
    sb.from('flujo_config').select('value').eq('key', 'app_notas').single(),
  ])
  return {
    todos: todosRow?.value ? JSON.parse(todosRow.value) : [],
    notas: notasRow?.value ?? '',
  }
}

export default async function NotasPage() {
  const { todos, notas } = await getData()
  return <NotasClient initialTodos={todos} initialNotas={notas} />
}
