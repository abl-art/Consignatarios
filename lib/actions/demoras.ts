'use server'

// Descartes manuales de la pestaña Demoras de entrega: el sync de traces de
// GOcelular se congela en algunos envíos (p. ej. queda en AsignacionACaja) y
// el envío figura sin entregar aunque Andreani lo muestre entregado. El admin
// verifica en Andreani y lo descarta; queda registrado en Supabase.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getDemorasDescartadas(): Promise<Set<string>> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('demoras_descartes').select('tracking')
  return new Set((data ?? []).map(r => r.tracking as string))
}

export async function descartarDemora(tracking: string, motivo: string): Promise<{ ok?: true; error?: string }> {
  const t = tracking.trim()
  if (!t) return { error: 'Tracking vacío' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('demoras_descartes')
    .upsert({ tracking: t, motivo: motivo.trim() || 'Verificado entregado en Andreani' }, { onConflict: 'tracking' })
  if (error) return { error: error.message }
  revalidatePath('/compras/envios')
  return { ok: true }
}
