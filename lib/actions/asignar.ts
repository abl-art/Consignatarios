'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

interface DispositivoInfo {
  imei: string
  modelo_id: string
  marca: string
  modelo: string
  precio_costo: number
}

interface AsignarInput {
  consignatario_id: string
  dispositivos: DispositivoInfo[]
  firmado_por: string
  firma_base64: string
  total_valor_costo: number
  total_valor_venta: number
}

// Legacy interface for backward compatibility
interface AsignarInputLegacy {
  consignatario_id: string
  dispositivo_ids: string[]
  firmado_por: string
  firma_base64: string
  total_valor_costo: number
  total_valor_venta: number
}

async function notificarGocelular(imeis: string[], consignatarioNombre: string) {
  const admin = createAdminClient()

  // Get the endpoint URL from config
  const { data: config } = await admin.from('flujo_config').select('value').eq('key', 'gocelular_assign_endpoint').single()
  const endpoint = config?.value

  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_to_consignee',
          imeis,
          consignatario: consignatarioNombre,
          timestamp: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        console.error('GOcelular notification failed:', res.status)
      }
    } catch (e) {
      console.error('GOcelular notification error:', e)
    }
  }

  // Always log the assignment for traceability
  await admin.from('flujo_config').upsert({
    key: `asignacion_log_${Date.now()}`,
    value: JSON.stringify({
      imeis,
      consignatario: consignatarioNombre,
      timestamp: new Date().toISOString(),
      notified: !!endpoint,
    }),
    updated_at: new Date().toISOString(),
  })
}

export async function asignarStock(input: AsignarInput | AsignarInputLegacy): Promise<
  { ok: true; asignacion_id: string } | { error: string }
> {
  const supabase = createClient()
  const admin = createAdminClient()

  // Determine if using new format (with dispositivos info) or legacy (just IDs)
  const isNew = 'dispositivos' in input && Array.isArray(input.dispositivos)
  const dispositivos = isNew ? (input as AsignarInput).dispositivos : []
  const imeis = isNew
    ? dispositivos.map(d => d.imei)
    : (input as AsignarInputLegacy).dispositivo_ids

  // For new format: ensure dispositivos exist in our Supabase
  if (isNew && dispositivos.length > 0) {
    for (const d of dispositivos) {
      // Check if modelo exists
      let modeloId: string | null = null
      const { data: existingModelo } = await admin
        .from('modelos')
        .select('id')
        .or(`modelo.eq.${d.modelo},modelo.ilike.%${d.modelo}%`)
        .eq('marca', d.marca)
        .limit(1)
        .single()

      if (existingModelo) {
        modeloId = existingModelo.id
      } else {
        // Create the modelo
        const { data: newModelo } = await admin
          .from('modelos')
          .insert({ marca: d.marca, modelo: d.modelo, precio_costo: d.precio_costo })
          .select('id')
          .single()
        modeloId = newModelo?.id ?? null
      }

      if (!modeloId) continue

      // Check if dispositivo exists
      const { data: existingDisp } = await admin
        .from('dispositivos')
        .select('id')
        .eq('imei', d.imei)
        .single()

      if (!existingDisp) {
        // Create dispositivo
        await admin.from('dispositivos').insert({
          imei: d.imei,
          modelo_id: modeloId,
          estado: 'disponible',
        })
      }
    }
  }

  // Get dispositivo IDs by IMEI
  const { data: dispRows } = await admin
    .from('dispositivos')
    .select('id, imei')
    .in('imei', imeis)

  if (!dispRows || dispRows.length === 0) {
    return { error: 'No se encontraron dispositivos con los IMEIs proporcionados' }
  }

  const dispositivo_ids = dispRows.map(d => d.id)

  // 1. Create asignacion row
  const { data: asignacion, error: errorAsignacion } = await supabase
    .from('asignaciones')
    .insert({
      consignatario_id: input.consignatario_id,
      fecha: new Date().toISOString().slice(0, 10),
      total_unidades: dispositivo_ids.length,
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
  const items = dispositivo_ids.map((dispositivo_id) => ({
    asignacion_id,
    dispositivo_id,
  }))

  const { error: errorItems } = await supabase.from('asignacion_items').insert(items)

  if (errorItems) {
    await supabase.from('asignaciones').delete().eq('id', asignacion_id)
    return { error: errorItems.message }
  }

  // 3. Update dispositivos: estado='asignado'
  const today = new Date().toISOString().slice(0, 10)
  const { error: errorUpdate } = await admin
    .from('dispositivos')
    .update({ estado: 'asignado', consignatario_id: input.consignatario_id, fecha_asignacion: today })
    .in('id', dispositivo_ids)

  if (errorUpdate) {
    await supabase.from('asignaciones').delete().eq('id', asignacion_id)
    return { error: errorUpdate.message }
  }

  // 4. Notify GOcelular (async, don't block)
  const { data: consig } = await admin.from('consignatarios').select('nombre').eq('id', input.consignatario_id).single()
  notificarGocelular(imeis, consig?.nombre || 'Desconocido').catch(() => {})

  revalidatePath('/asignar')
  revalidatePath('/inventario')
  revalidatePath('/dashboard')

  return { ok: true, asignacion_id }
}
