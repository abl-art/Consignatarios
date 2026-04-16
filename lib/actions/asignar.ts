'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface AsignarInput {
  consignatario_id: string
  dispositivo_ids: string[]
  firmado_por: string
  firma_base64: string
  total_valor_costo: number
  total_valor_venta: number
}

export async function asignarStock(input: AsignarInput): Promise<
  { ok: true; asignacion_id: string } | { error: string }
> {
  const supabase = createClient()

  // 1. Create asignacion row
  const { data: asignacion, error: errorAsignacion } = await supabase
    .from('asignaciones')
    .insert({
      consignatario_id: input.consignatario_id,
      fecha: new Date().toISOString().slice(0, 10),
      total_unidades: input.dispositivo_ids.length,
      total_valor_costo: input.total_valor_costo,
      total_valor_venta: input.total_valor_venta,
      firmado_por: input.firmado_por,
      firma_url: input.firma_base64,
    })
    .select('id')
    .single()

  if (errorAsignacion || !asignacion) {
    return { error: errorAsignacion?.message ?? 'Error al crear la asignación' }
  }

  const asignacion_id = asignacion.id

  // 2. Insert asignacion_items
  const items = input.dispositivo_ids.map((dispositivo_id) => ({
    asignacion_id,
    dispositivo_id,
  }))

  const { error: errorItems } = await supabase.from('asignacion_items').insert(items)

  if (errorItems) {
    // Rollback: delete asignacion (cascade deletes items)
    await supabase.from('asignaciones').delete().eq('id', asignacion_id)
    return { error: errorItems.message }
  }

  // 3. Update dispositivos: estado='asignado', consignatario_id set, fecha_asignacion = today
  const today = new Date().toISOString().slice(0, 10)
  const { error: errorUpdate } = await supabase
    .from('dispositivos')
    .update({ estado: 'asignado', consignatario_id: input.consignatario_id, fecha_asignacion: today })
    .in('id', input.dispositivo_ids)

  if (errorUpdate) {
    // Rollback: delete asignacion (cascade deletes items)
    await supabase.from('asignaciones').delete().eq('id', asignacion_id)
    return { error: errorUpdate.message }
  }

  revalidatePath('/asignar')
  revalidatePath('/inventario')
  revalidatePath('/dashboard')

  return { ok: true, asignacion_id }
}
