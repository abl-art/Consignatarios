import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Verificar CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()

  // Mes anterior
  const now = new Date()
  const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const mes = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`
  const fechaInicio = `${mes}-01`
  const ultimoDia = new Date(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1, 0)
  const fechaFin = ultimoDia.toISOString().slice(0, 10)

  // Verificar si ya existen liquidaciones para este mes
  const { count: existentes } = await sb.from('liquidaciones').select('*', { count: 'exact', head: true }).eq('mes', mes)
  if (existentes && existentes > 0) {
    return NextResponse.json({ ok: true, message: `Liquidaciones de ${mes} ya existen (${existentes})`, creadas: 0 })
  }

  // Cargar ventas del período
  const { data: ventas } = await sb
    .from('ventas')
    .select('consignatario_id, comision_monto')
    .gte('fecha_venta', fechaInicio)
    .lte('fecha_venta', fechaFin)

  // Cargar diferencias pendientes
  const { data: diferencias } = await sb
    .from('diferencias')
    .select('monto_deuda, auditorias(consignatario_id)')
    .eq('estado', 'pendiente')

  // Agregar comisiones por consignatario
  const comisionesPorC: Record<string, number> = {}
  for (const v of ventas ?? []) {
    comisionesPorC[v.consignatario_id] = (comisionesPorC[v.consignatario_id] ?? 0) + (v.comision_monto ?? 0)
  }

  // Agregar diferencias por consignatario
  type DifRow = { monto_deuda: number; auditorias: { consignatario_id: string } | null }
  const difPorC: Record<string, number> = {}
  for (const d of ((diferencias ?? []) as unknown as DifRow[])) {
    const cid = d.auditorias?.consignatario_id
    if (!cid) continue
    difPorC[cid] = (difPorC[cid] ?? 0) + (d.monto_deuda ?? 0)
  }

  let creadas = 0
  for (const [cid, comisiones] of Object.entries(comisionesPorC)) {
    if (comisiones <= 0) continue
    const dif = difPorC[cid] ?? 0
    const { error } = await sb.from('liquidaciones').insert({
      consignatario_id: cid,
      mes,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      total_comisiones: comisiones,
      total_diferencias_descontadas: dif,
      monto_a_pagar: Math.max(0, comisiones - dif),
      estado: 'borrador',
    })
    if (!error) creadas++
  }

  return NextResponse.json({ ok: true, mes, creadas })
}
