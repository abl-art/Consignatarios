import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Consignatario } from '@/lib/types'

export async function getCurrentConsignatario(): Promise<Consignatario> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: consignatario } = await supabase
    .from('consignatarios')
    .select('*')
    .eq('user_id', user.id)
    .single<Consignatario>()

  if (!consignatario) redirect('/login')
  return consignatario
}
