import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const rol = user.app_metadata?.rol
  redirect(rol === 'admin' || rol === 'restringido' ? '/dashboard' : '/stock')
}
