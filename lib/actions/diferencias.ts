'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { EstadoDiferencia } from '@/lib/types'

export async function actualizarEstadoDiferencia(
  id: string,
  estado: EstadoDiferencia,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('diferencias')
    .update({ estado })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/diferencias')
  revalidatePath('/dashboard')

  return { ok: true }
}
