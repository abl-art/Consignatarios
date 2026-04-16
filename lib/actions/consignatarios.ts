'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface EditInput {
  id: string
  nombre: string
  telefono: string | null
  comision_porcentaje: number
  punto_reorden: number
  garantia: number
}

export async function editarConsignatario(input: EditInput) {
  const supabase = createClient()
  const { error } = await supabase.from('consignatarios').update({
    nombre: input.nombre,
    telefono: input.telefono,
    comision_porcentaje: input.comision_porcentaje,
    punto_reorden: input.punto_reorden,
    garantia: input.garantia,
  }).eq('id', input.id)
  if (error) return { error: error.message }
  revalidatePath(`/consignatarios/${input.id}`)
  revalidatePath('/consignatarios')
  return { ok: true }
}
