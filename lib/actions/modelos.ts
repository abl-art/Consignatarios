'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface EditInput {
  id: string
  marca: string
  modelo: string
  precio_costo: number
}

export async function editarModelo(input: EditInput) {
  const supabase = createClient()
  const { error } = await supabase.from('modelos').update({
    marca: input.marca,
    modelo: input.modelo,
    precio_costo: input.precio_costo,
  }).eq('id', input.id)
  if (error) return { error: error.message }
  revalidatePath('/modelos')
  revalidatePath('/inventario')
  revalidatePath('/asignar')
  return { ok: true }
}

export async function eliminarModelo(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('modelos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/modelos')
  return { ok: true }
}
