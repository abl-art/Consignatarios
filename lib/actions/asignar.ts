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

interface PrepararAsignacionInput {
  consignatario_id: string
  dispositivos: DispositivoInfo[]
  total_valor_costo: number
  total_valor_venta: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDispositivosExist(admin: ReturnType<typeof createAdminClient>, dispositivos: DispositivoInfo[]) {
  for (const d of dispositivos) {
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
      const { data: newModelo } = await admin
        .from('modelos')
        .insert({ marca: d.marca, modelo: d.modelo, precio_costo: d.precio_costo })
        .select('id')
        .single()
      modeloId = newModelo?.id ?? null
    }

    if (!modeloId) continue

    const { data: existingDisp } = await admin
      .from('dispositivos')
      .select('id')
      .eq('imei', d.imei)
      .single()

    if (!existingDisp) {
      await admin.from('dispositivos').insert({
        imei: d.imei,
        modelo_id: modeloId,
        estado: 'disponible',
      })
    }
  }
}

async function notificarGocelular(
  admin: ReturnType<typeof createAdminClient>,
  imeis: string[],
  consignatarioId: string,
  consignatarioNombre: string,
  action: 'assign_to_consignee' | 'return_from_consignee'
) {
  const { data: config } = await admin.from('flujo_config').select('value').eq('key', 'gocelular_assign_endpoint').single()
  const endpoint = config?.value

  // Get store_id from consignatario
  let storeId: string | null = null
  if (consignatarioId) {
    const { data: consig } = await admin.from('consignatarios').select('store_id').eq('id', consignatarioId).single()
    storeId = consig?.store_id ?? null
  }

  const timestamp = new Date().toISOString().replace('Z', '-03:00') // Argentina timezone
  const payload = {
    action,
    imeis,
    consignatario: consignatarioNombre,
    ...(storeId ? { gocuotas_store_id: storeId } : {}),
    timestamp,
  }

  let response: { processed?: number; skipped?: number; error?: string } | null = null

  if (endpoint) {
    // Retry with backoff: 2s, 4s, 8s
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const body = await res.json().catch(() => null)

        if (res.status === 200) {
          response = { processed: body?.counts?.processed ?? 0, skipped: body?.counts?.skipped ?? 0 }
          break
        } else if (res.status >= 400 && res.status < 500) {
          // 4xx: don't retry, payload issue
          response = { error: body?.error ?? `HTTP ${res.status}` }
          console.error('GOcelular webhook 4xx:', body)
          break
        } else {
          // 5xx: retry
          console.error(`GOcelular webhook attempt ${attempt + 1} failed: HTTP ${res.status}`)
          if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
        }
      } catch (e) {
        console.error(`GOcelular webhook attempt ${attempt + 1} error:`, e)
        if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
      }
    }
  }

  // Log the operation
  await admin.from('flujo_config').upsert({
    key: `asignacion_log_${Date.now()}`,
    value: JSON.stringify({
      action, imeis, consignatario: consignatarioNombre, storeId,
      timestamp, notified: !!endpoint, response,
    }),
    updated_at: new Date().toISOString(),
  })
}

// ---------------------------------------------------------------------------
// Step 1: Preparar asignación (borrador - sin firma)
// ---------------------------------------------------------------------------

export async function prepararAsignacion(input: PrepararAsignacionInput): Promise<
  { ok: true; asignacion_id: string } | { error: string }
> {
  const admin = createAdminClient()

  // Ensure dispositivos exist in Supabase
  await ensureDispositivosExist(admin, input.dispositivos)

  const imeis = input.dispositivos.map(d => d.imei)

  // Get dispositivo IDs by IMEI
  const { data: dispRows } = await admin.from('dispositivos').select('id, imei').in('imei', imeis)
  if (!dispRows || dispRows.length === 0) {
    return { error: 'No se encontraron dispositivos con los IMEIs proporcionados' }
  }

  const dispositivo_ids = dispRows.map(d => d.id)
  const today = new Date().toISOString().slice(0, 10)

  // 1. Create asignacion in borrador state
  const { data: asignacion, error: errorAsignacion } = await admin
    .from('asignaciones')
    .insert({
      consignatario_id: input.consignatario_id,
      fecha: today,
      total_unidades: dispositivo_ids.length,
      total_valor_costo: input.total_valor_costo,
      total_valor_venta: input.total_valor_venta,
      firmado_por: null,
      firma_url: null,
    })
    .select('id')
    .single()

  if (errorAsignacion || !asignacion) {
    return { error: errorAsignacion?.message ?? 'Error al crear la asignación' }
  }

  // 2. Insert asignacion_items
  const items = dispositivo_ids.map(dispositivo_id => ({ asignacion_id: asignacion.id, dispositivo_id }))
  const { error: errorItems } = await admin.from('asignacion_items').insert(items)

  if (errorItems) {
    await admin.from('asignaciones').delete().eq('id', asignacion.id)
    return { error: errorItems.message }
  }

  // 3. Mark dispositivos as en_transito
  await admin
    .from('dispositivos')
    .update({ estado: 'asignado', consignatario_id: input.consignatario_id, fecha_asignacion: today })
    .in('id', dispositivo_ids)

  // 4. Notify GOcelular
  const { data: consig } = await admin.from('consignatarios').select('nombre').eq('id', input.consignatario_id).single()
  notificarGocelular(admin, imeis, input.consignatario_id, consig?.nombre || '', 'assign_to_consignee').catch(() => {})

  revalidatePath('/asignar')
  revalidatePath('/inventario')
  revalidatePath('/dashboard')

  return { ok: true, asignacion_id: asignacion.id }
}

// ---------------------------------------------------------------------------
// Eliminar borrador (devuelve equipos a disponible)
// ---------------------------------------------------------------------------

export async function eliminarBorrador(asignacionId: string): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()

  // Get items to revert dispositivos
  const { data: items } = await admin.from('asignacion_items').select('dispositivo_id, dispositivos(imei)').eq('asignacion_id', asignacionId)

  // Revert dispositivos to disponible
  const dispIds = (items ?? []).map(i => i.dispositivo_id)
  if (dispIds.length > 0) {
    await admin.from('dispositivos').update({ estado: 'disponible', consignatario_id: null, fecha_asignacion: null }).in('id', dispIds)
  }

  // Notify GOcelular to return to stock
  const imeis = (items ?? []).map(i => (i.dispositivos as unknown as { imei: string } | null)?.imei).filter(Boolean) as string[]
  if (imeis.length > 0) {
    // Get consignatario info for the return notification
    const { data: asig } = await admin.from('asignaciones').select('consignatario_id, consignatarios(nombre)').eq('id', asignacionId).single()
    const cid = (asig as unknown as { consignatario_id: string })?.consignatario_id || ''
    const cname = (asig as unknown as { consignatarios: { nombre: string } | null })?.consignatarios?.nombre || ''
    notificarGocelular(admin, imeis, cid, cname, 'return_from_consignee').catch(() => {})
  }

  // Delete items and asignacion
  await admin.from('asignacion_items').delete().eq('asignacion_id', asignacionId)
  await admin.from('asignaciones').delete().eq('id', asignacionId)

  revalidatePath('/asignar')
  revalidatePath('/consignatarios/asignaciones')
  revalidatePath('/inventario')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Step 2: Confirmar asignación (firma del consignatario)
// ---------------------------------------------------------------------------

export async function confirmarAsignacion(asignacionId: string, firmadoPor: string, firmaBase64: string): Promise<
  { ok: true } | { error: string }
> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('asignaciones')
    .update({ firmado_por: firmadoPor, firma_url: firmaBase64 })
    .eq('id', asignacionId)

  if (error) return { error: error.message }

  revalidatePath('/asignar')
  revalidatePath('/inventario')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Get borradores (asignaciones sin firma)
// ---------------------------------------------------------------------------

export async function getBorradores() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('asignaciones')
    .select('id, consignatario_id, fecha, total_unidades, total_valor_costo, total_valor_venta, firmado_por, firma_url, consignatarios(nombre), asignacion_items(dispositivo_id, dispositivos(imei, modelos(marca, modelo)))')
    .is('firma_url', null)
    .order('fecha', { ascending: false })

  return (data ?? []) as unknown as {
    id: string
    consignatario_id: string
    fecha: string
    total_unidades: number
    total_valor_costo: number
    total_valor_venta: number
    firmado_por: string | null
    firma_url: string | null
    consignatarios: { nombre: string } | null
    asignacion_items: { dispositivo_id: string; dispositivos: { imei: string; modelos: { marca: string; modelo: string } | null } | null }[]
  }[]
}

// ---------------------------------------------------------------------------
// Devolver equipo (return to GOcelular stock)
// ---------------------------------------------------------------------------

export async function devolverEquipo(dispositivoId: string): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()

  // Get device info
  const { data: disp } = await admin.from('dispositivos').select('imei, consignatario_id').eq('id', dispositivoId).single()
  if (!disp) return { error: 'Dispositivo no encontrado' }

  // Update estado
  const { error } = await admin
    .from('dispositivos')
    .update({ estado: 'devuelto', consignatario_id: null })
    .eq('id', dispositivoId)

  if (error) return { error: error.message }

  // Get consignatario name for notification
  const consigId = disp.consignatario_id || ''
  const { data: consigData } = consigId ? await admin.from('consignatarios').select('nombre').eq('id', consigId).single() : { data: null }

  // Notify GOcelular to re-add to available stock
  notificarGocelular(admin, [disp.imei], consigId, consigData?.nombre || '', 'return_from_consignee').catch(() => {})

  revalidatePath('/asignar')
  revalidatePath('/inventario')
  revalidatePath('/consignatarios')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Legacy: asignarStock (backward compatibility)
// ---------------------------------------------------------------------------

interface AsignarInput {
  consignatario_id: string
  dispositivos: DispositivoInfo[]
  firmado_por: string
  firma_base64: string
  total_valor_costo: number
  total_valor_venta: number
}

export async function asignarStock(input: AsignarInput): Promise<
  { ok: true; asignacion_id: string } | { error: string }
> {
  // Use new flow: prepare + confirm immediately
  const result = await prepararAsignacion({
    consignatario_id: input.consignatario_id,
    dispositivos: input.dispositivos,
    total_valor_costo: input.total_valor_costo,
    total_valor_venta: input.total_valor_venta,
  })

  if ('error' in result) return result

  // Immediately confirm with firma
  await confirmarAsignacion(result.asignacion_id, input.firmado_por, input.firma_base64)

  return result
}
