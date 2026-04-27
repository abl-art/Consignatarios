export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import NotasClient from './NotasClient'

async function getData() {
  const sb = createAdminClient()
  const [{ data: todosRow }, { data: notasRow }, { data: guardadasRow }, { data: notasEvRow }] = await Promise.all([
    sb.from('flujo_config').select('value').eq('key', 'app_todos').single(),
    sb.from('flujo_config').select('value').eq('key', 'app_notas').single(),
    sb.from('flujo_config').select('value').eq('key', 'app_notas_guardadas').single(),
    sb.from('flujo_config').select('value').eq('key', 'app_notas_eventos').single(),
  ])
  const todosRaw = todosRow?.value ? JSON.parse(todosRow.value) : {}
  const todos = Array.isArray(todosRaw) ? {} : todosRaw
  const guardadas = guardadasRow?.value ? JSON.parse(guardadasRow.value) : []
  const notasEventos = notasEvRow?.value ? JSON.parse(notasEvRow.value) : {}
  return { todos, notas: notasRow?.value ?? '', guardadas, notasEventos }
}

export default async function NotasPage() {
  const { todos, notas, guardadas, notasEventos } = await getData()
  return <NotasClient initialTodos={todos} initialNotas={notas} initialGuardadas={guardadas} initialNotasEventos={notasEventos} />
}
