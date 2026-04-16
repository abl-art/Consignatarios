'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface AutoAuditoriaInput {
  consignatario_id: string
  observaciones: string
  firma_base64: string
  dispositivo_ids_presentes: string[]
}

export async function confirmarAutoAuditoria(input: AutoAuditoriaInput) {
  const supabase = createClient()

  const { data: asignados } = await supabase
    .from('dispositivos').select('id')
    .eq('consignatario_id', input.consignatario_id).eq('estado', 'asignado')

  if (!asignados || asignados.length === 0) {
    return { error: 'No tenés dispositivos asignados para auditar' }
  }

  const { data: auditoria, error: auditoriaError } = await supabase
    .from('auditorias').insert({
      consignatario_id: input.consignatario_id,
      realizada_por: 'Consignatario (auto)',
      fecha: new Date().toISOString().split('T')[0],
      estado: 'borrador',
      tipo: 'auto',
      observaciones: input.observaciones || null,
      firma_url: input.firma_base64,
    })
    .select('id').single()

  if (auditoriaError || !auditoria) return { error: auditoriaError?.message ?? 'Error al crear' }

  const presentes = new Set(input.dispositivo_ids_presentes)
  const items = asignados.map((d) => ({
    auditoria_id: auditoria.id,
    dispositivo_id: d.id,
    presente: presentes.has(d.id),
  }))

  const { error: itemsError } = await supabase.from('auditoria_items').insert(items)
  if (itemsError) {
    await supabase.from('auditorias').delete().eq('id', auditoria.id)
    return { error: itemsError.message }
  }

  const { error: rpcError } = await supabase.rpc('calcular_diferencias_auditoria', {
    p_auditoria_id: auditoria.id,
  })
  if (rpcError) return { error: rpcError.message }

  const now = new Date()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const today = now.toISOString().split('T')[0]

  await supabase.from('liquidaciones')
    .update({ estado: 'pendiente', fecha_auto_auditoria: today })
    .eq('consignatario_id', input.consignatario_id)
    .eq('mes', mesActual)
    .eq('estado', 'retenida')

  revalidatePath('/auto-auditoria')
  revalidatePath('/mis-liquidaciones')
  revalidatePath('/mi-dashboard')
  return { ok: true, auditoria_id: auditoria.id }
}
