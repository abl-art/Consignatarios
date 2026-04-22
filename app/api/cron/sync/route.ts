import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchNewSales, fetchAnuladas } from '@/lib/gocelular'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Verificar que viene de Vercel Cron (header Authorization)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Abrir log
  const { data: logRow, error: logErr } = await admin
    .from('sync_log')
    .insert({ status: 'running', created_by: null })
    .select('id')
    .single()
  if (logErr || !logRow) {
    return NextResponse.json({ error: logErr?.message ?? 'No se pudo iniciar log' }, { status: 500 })
  }
  const logId = logRow.id as string

  try {
    const [{ data: dispositivos }, { data: ventas }, { data: consignatarios }] = await Promise.all([
      admin.from('dispositivos').select('id, imei, consignatario_id').eq('estado', 'asignado'),
      admin.from('ventas').select('gocelular_sale_id').not('gocelular_sale_id', 'is', null),
      admin.from('consignatarios').select('id, nombre, comision_porcentaje, store_prefix'),
    ])

    const dispositivosList = (dispositivos ?? []) as { id: string; imei: string; consignatario_id: string | null }[]
    const ourImeis = dispositivosList.map(d => d.imei).filter(Boolean)
    const alreadySynced = ((ventas ?? []) as { gocelular_sale_id: string | null }[])
      .map(v => v.gocelular_sale_id)
      .filter((x): x is string => x !== null)

    const sales = await fetchNewSales({ ourImeis, alreadySyncedSaleIds: alreadySynced })

    const disByImei = new Map<string, typeof dispositivosList[0]>()
    for (const d of dispositivosList) disByImei.set(d.imei, d)

    const consigById = new Map<string, { id: string; comision_porcentaje: number; store_prefix: string | null }>()
    for (const c of (consignatarios ?? []) as { id: string; nombre: string; comision_porcentaje: number; store_prefix: string | null }[]) {
      consigById.set(c.id, c)
    }

    let nuevas = 0
    let yaExistentes = 0
    let noEncontrados = 0

    for (const sale of sales) {
      const dispositivo = disByImei.get(sale.imei)
      if (!dispositivo || !dispositivo.consignatario_id) {
        noEncontrados++
        continue
      }
      const consig = consigById.get(dispositivo.consignatario_id)
      const precioRaw = Number(sale.price ?? sale.default_price ?? sale.total_order_amount ?? 0)
      const precio = precioRaw > 5000000 ? precioRaw / 100 : precioRaw
      const precioNeto = precio / 1.21
      const comision = consig ? precioNeto * Number(consig.comision_porcentaje) : 0

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
        if (insertErr.code === '23505') { yaExistentes++; continue }
        throw new Error(`Error insertando venta IMEI ${sale.imei}: ${insertErr.message}`)
      }

      nuevas++
      await admin.from('dispositivos').update({ estado: 'vendido' }).eq('id', dispositivo.id)
    }

    // Detectar anulaciones
    let anuladas = 0
    const allSyncedIds = [...alreadySynced, ...sales.map(s => s.assigned_to_order_id)].filter(Boolean)
    if (allSyncedIds.length > 0) {
      const idsAnulados = await fetchAnuladas(allSyncedIds)
      for (const orderId of idsAnulados) {
        const { data: ventaAnulada } = await admin
          .from('ventas')
          .select('id, dispositivo_id')
          .eq('gocelular_sale_id', orderId)
          .single()
        if (!ventaAnulada) continue
        await admin.from('ventas').delete().eq('id', ventaAnulada.id)
        await admin.from('dispositivos').update({ estado: 'asignado' }).eq('id', ventaAnulada.dispositivo_id)
        anuladas++
      }
    }

    await admin.from('sync_log').update({
      status: 'ok',
      finished_at: new Date().toISOString(),
      ventas_nuevas: nuevas,
      ventas_ya_existentes: yaExistentes,
      dispositivos_no_encontrados: noEncontrados,
      errores_monitoreo: anuladas,
    }).eq('id', logId)

    return NextResponse.json({ ok: true, nuevas, yaExistentes, noEncontrados, anuladas })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin.from('sync_log').update({
      status: 'error',
      finished_at: new Date().toISOString(),
      error_msg: msg,
    }).eq('id', logId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
