'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function getTenenciaModelosOcultos(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenencia_modelos_ocultos')
    .select('model_code')
    .order('model_code')
  return (data ?? []).map(r => r.model_code)
}

export async function ocultarTenenciaModelo(modelCode: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tenencia_modelos_ocultos')
    .upsert({ model_code: modelCode }, { onConflict: 'model_code' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario/tenencia-propia')
  return { ok: true }
}

export async function mostrarTenenciaModelo(modelCode: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tenencia_modelos_ocultos')
    .delete()
    .eq('model_code', modelCode)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario/tenencia-propia')
  return { ok: true }
}
