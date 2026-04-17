'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { fetchNewSales, fetchAnuladas } from '@/lib/gocelular'

interface DispositivoRow {
  id: string
  imei: string
  consignatario_id: string | null
}

interface ConsignatarioRow {
  id: string
  nombre: string
  comision_porcentaje: number
  store_prefix: string | null
}

export async function sincronizarVentas() {
  const admin = createAdminClient()
  const auth = createClient()
  const { data: { user } } = await auth.auth.getUser()

  // Open log row
  const { data: logRow, error: logErr } = await admin
    .from('sync_log')
    .insert({ status: 'running', created_by: user?.id ?? null })
    .select('id')
    .single()
  if (logErr || !logRow) {
    return { error: logErr?.message ?? 'No se pudo iniciar el log de sync' }
  }
  const logId = logRow.id as string

  try {
    // Load candidate devices, already-synced sale IDs, and consignatarios
    const [{ data: dispositivos }, { data: ventas }, { data: consignatarios }] = await Promise.all([
      admin.from('dispositivos').select('id, imei, consignatario_id').eq('estado', 'asignado'),
      admin.from('ventas').select('gocelular_sale_id').not('gocelular_sale_id', 'is', null),
      admin.from('consignatarios').select('id, nombre, comision_porcentaje, store_prefix'),
    ])

    const dispositivosList = (dispositivos ?? []) as DispositivoRow[]
    const ourImeis = dispositivosList.map((d) => d.imei).filter(Boolean)
    const alreadySynced = ((ventas ?? []) as { gocelular_sale_id: string | null }[])
      .map((v) => v.gocelular_sale_id)
      .filter((x): x is string => x !== null)

    const sales = await fetchNewSales({ ourImeis, alreadySyncedSaleIds: alreadySynced })

    const disByImei = new Map<string, DispositivoRow>()
    for (const d of dispositivosList) disByImei.set(d.imei, d)

    const consigById = new Map<string, ConsignatarioRow>()
    for (const c of (consignatarios ?? []) as ConsignatarioRow[]) consigById.set(c.id, c)

    let nuevas = 0
    let yaExistentes = 0
    let noEncontrados = 0
    const storeMismatches: { imei: string; expected_prefix: string; actual_store: string }[] = []

    for (const sale of sales) {
      const dispositivo = disByImei.get(sale.imei)
      if (!dispositivo || !dispositivo.consignatario_id) {
        noEncontrados++
        continue
      }
      const consig = consigById.get(dispositivo.consignatario_id)
      const precio = Number(sale.price ?? sale.default_price ?? sale.total_order_amount ?? 0)
      const precioNeto = precio / 1.21
      const comision = consig ? precioNeto * Number(consig.comision_porcentaje) : 0

      if (consig?.store_prefix && sale.store_name && !sale.store_name.toLowerCase().startsWith(consig.store_prefix.toLowerCase())) {
        storeMismatches.push({
          imei: sale.imei,
          expected_prefix: consig.store_prefix,
          actual_store: sale.store_name,
        })
      }

      const { error: insertErr } = await admin.from('ventas').insert({
        dispositivo_id: dispositivo.id,
        consignatario_id: dispositivo.consignatario_id,
        fecha_venta: sale.assigned_at.slice(0, 10),
        precio_venta: precio,
        comision_monto: comision,
        gocelular_sale_id: sale.assigned_to_order_id,
        store_name: sale.store_name,
      })

      if (insertErr) {
        if (insertErr.code === '23505') {
          yaExistentes++
          continue
        }
        throw new Error(`Error insertando venta IMEI ${sale.imei}: ${insertErr.message}`)
      }

      nuevas++
      await admin.from('dispositivos').update({ estado: 'vendido' }).eq('id', dispositivo.id)
    }

    // ── Paso 2: Detectar anulaciones ─────────────────────────────────
    // Buscar ventas que ya sincronizamos pero cuya orden fue anulada en GOcelular.
    // Para esas: borrar la venta + devolver el dispositivo a 'asignado'.
    let anuladas = 0
    const allSyncedIds = [...alreadySynced, ...sales.map((s) => s.assigned_to_order_id)].filter(Boolean)
    if (allSyncedIds.length > 0) {
      const idsAnulados = await fetchAnuladas(allSyncedIds)
      for (const orderId of idsAnulados) {
        // Buscar la venta en nuestra DB
        const { data: ventaAnulada } = await admin
          .from('ventas')
          .select('id, dispositivo_id')
          .eq('gocelular_sale_id', orderId)
          .single()
        if (!ventaAnulada) continue

        // Borrar la venta
        await admin.from('ventas').delete().eq('id', ventaAnulada.id)
        // Devolver dispositivo a asignado
        await admin.from('dispositivos').update({ estado: 'asignado' }).eq('id', ventaAnulada.dispositivo_id)
        anuladas++
      }
    }

    await admin
      .from('sync_log')
      .update({
        status: 'ok',
        finished_at: new Date().toISOString(),
        ventas_nuevas: nuevas,
        ventas_ya_existentes: yaExistentes,
        dispositivos_no_encontrados: noEncontrados,
        errores_monitoreo: anuladas,
        detalle: storeMismatches.length > 0 || anuladas > 0
          ? {
              store_mismatches: storeMismatches.length > 0 ? storeMismatches : undefined,
              anuladas,
            }
          : null,
      })
      .eq('id', logId)

    revalidatePath('/sync')
    revalidatePath('/ventas')
    revalidatePath('/mis-ventas')
    revalidatePath('/dashboard')
    revalidatePath('/mi-dashboard')
    revalidatePath('/inventario')

    return {
      ok: true as const,
      nuevas,
      yaExistentes,
      noEncontrados,
      anuladas,
      storeMismatches: storeMismatches.length,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from('sync_log')
      .update({
        status: 'error',
        finished_at: new Date().toISOString(),
        error_msg: msg,
      })
      .eq('id', logId)
    return { error: msg }
  }
}
