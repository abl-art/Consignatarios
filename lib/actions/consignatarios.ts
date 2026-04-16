'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

interface EditInput {
  id: string
  user_id: string | null
  nombre: string
  email: string
  telefono: string | null
  comision_porcentaje: number
  punto_reorden: number
  garantia: number
  store_prefix: string | null
  newPassword?: string // optional — solo si el admin quiere resetearla
}

export async function editarConsignatario(input: EditInput) {
  const supabase = createClient()
  const { error } = await supabase.from('consignatarios').update({
    nombre: input.nombre,
    email: input.email,
    telefono: input.telefono,
    comision_porcentaje: input.comision_porcentaje,
    punto_reorden: input.punto_reorden,
    garantia: input.garantia,
    store_prefix: input.store_prefix,
  }).eq('id', input.id)
  if (error) return { error: error.message }

  // Actualizar credenciales en Supabase Auth si cambió email o se pidió nueva contraseña
  if (input.user_id) {
    const authUpdates: { email?: string; password?: string } = {}
    if (input.email) authUpdates.email = input.email
    if (input.newPassword && input.newPassword.length >= 6) authUpdates.password = input.newPassword
    if (Object.keys(authUpdates).length > 0) {
      const admin = createAdminClient()
      const { error: authErr } = await admin.auth.admin.updateUserById(input.user_id, authUpdates)
      if (authErr) return { error: `Datos guardados pero credenciales no se actualizaron: ${authErr.message}` }
    }
  }

  revalidatePath(`/consignatarios/${input.id}`)
  revalidatePath('/consignatarios')
  return { ok: true }
}
