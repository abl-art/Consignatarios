'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function guardarCredencial(consignatarioId: string, password: string) {
  const admin = createAdminClient()

  // Get current passwords
  const { data: config } = await admin.from('flujo_config').select('value').eq('key', 'credenciales_consignatarios').single()
  const passwords: Record<string, string> = config?.value ? JSON.parse(config.value) : {}

  // Update password in our store
  passwords[consignatarioId] = password

  await admin.from('flujo_config').upsert({
    key: 'credenciales_consignatarios',
    value: JSON.stringify(passwords),
    updated_at: new Date().toISOString(),
  })

  // Also update in Supabase Auth
  const { data: consig } = await admin.from('consignatarios').select('user_id').eq('id', consignatarioId).single()
  if (consig?.user_id) {
    await admin.auth.admin.updateUserById(consig.user_id, { password })
  }

  revalidatePath('/consignatarios/credenciales')
}
