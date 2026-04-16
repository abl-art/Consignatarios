'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface AuditoriaItem {
  dispositivo_id: string
  presente: boolean
}

interface CrearAuditoriaInput {
  consignatario_id: string
  realizada_por: string
  observaciones?: string
  firma_base64?: string
  items: AuditoriaItem[]
  confirmar: boolean
  tipo?: 'fisica' | 'auto'
}

export async function crearAuditoria(input: CrearAuditoriaInput): Promise<{ ok: true; auditoria_id: string } | { error: string }> {
  const supabase = createClient()

  const today = new Date().toISOString().split('T')[0]

  const { data: auditoria, error: auditoriaError } = await supabase
    .from('auditorias')
    .insert({
      consignatario_id: input.consignatario_id,
      realizada_por: input.realizada_por,
      observaciones: input.observaciones ?? null,
      firma_url: input.firma_base64 ?? null,
      fecha: today,
      estado: 'borrador',
      tipo: input.tipo ?? 'fisica',
    })
    .select()
    .single()

  if (auditoriaError || !auditoria) {
    return { error: auditoriaError?.message ?? 'Error al crear la auditoría' }
  }

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase
      .from('auditoria_items')
      .insert(
        input.items.map((item) => ({
          auditoria_id: auditoria.id,
          dispositivo_id: item.dispositivo_id,
          presente: item.presente,
        }))
      )

    if (itemsError) {
      // Rollback: delete the auditoria
      await supabase.from('auditorias').delete().eq('id', auditoria.id)
      return { error: itemsError.message }
    }
  }

  if (input.confirmar) {
    const { error: rpcError } = await supabase.rpc('calcular_diferencias_auditoria', {
      p_auditoria_id: auditoria.id,
    })

    if (rpcError) {
      // Rollback: delete items and auditoria
      await supabase.from('auditoria_items').delete().eq('auditoria_id', auditoria.id)
      await supabase.from('auditorias').delete().eq('id', auditoria.id)
      return { error: rpcError.message }
    }
  }

  revalidatePath('/auditorias')
  revalidatePath('/diferencias')
  revalidatePath('/dashboard')

  return { ok: true, auditoria_id: auditoria.id }
}
