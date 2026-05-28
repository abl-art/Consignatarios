'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function getModelosOcultos(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('kits_modelos_ocultos')
    .select('modelo')
    .order('modelo')
  return (data ?? []).map(r => r.modelo)
}

export async function ocultarModelo(modelo: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('kits_modelos_ocultos')
    .upsert({ modelo }, { onConflict: 'modelo' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario/kits-seguridad')
  revalidatePath('/proveedor/kits')
  return { ok: true }
}

export async function mostrarModelo(modelo: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('kits_modelos_ocultos')
    .delete()
    .eq('modelo', modelo)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario/kits-seguridad')
  revalidatePath('/proveedor/kits')
  return { ok: true }
}
