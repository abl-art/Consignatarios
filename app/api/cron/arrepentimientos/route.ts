import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decidirAccionMail } from '@/lib/arrepentimientos'
import { leerEstadoBuzon, leerMailsNuevos } from '@/lib/arrepentimientos-mail'
import { fetchOrdenPorDni, fetchRescateYaSolicitado } from '@/lib/gocelular'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Ingesta del Botón de Arrepentimiento (ver spec
// docs/superpowers/specs/2026-10-05-arrepentimientos-design.md). Corre por
// pg_cron cada 30 min. Primera corrida (sin fila de estado) o cambio de
// UIDVALIDITY de Gmail: siembra el cursor en el UID más alto y NO procesa
// nada (arranque sin backfill). El cursor avanza mail a mail: si el proceso
// muere a mitad de lote, la corrida siguiente reintenta sin duplicar
// (email_uid es unique).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: estado } = await admin
    .from('arrepentimientos_estado')
    .select('ultimo_uid, uidvalidity')
    .eq('id', 1)
    .maybeSingle()

  const buzon = await leerEstadoBuzon()
  if (!estado || Number(estado.uidvalidity) !== buzon.uidValidity) {
    const { error } = await admin.from('arrepentimientos_estado').upsert({
      id: 1,
      ultimo_uid: buzon.maxUid,
      uidvalidity: buzon.uidValidity,
      updated_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ ok: false, resultado: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true,
      resultado: estado
        ? `UIDVALIDITY cambió (${estado.uidvalidity} → ${buzon.uidValidity}): cursor re-sembrado en ${buzon.maxUid}`
        : `cursor sembrado en UID ${buzon.maxUid} — sin backfill`,
    })
  }

  const lote = await leerMailsNuevos(Number(estado.ultimo_uid))
  let nuevos = 0
  let insistencias = 0
  let yaSolicitados = 0

  for (const mail of lote.mails) {
    const orden = await fetchOrdenPorDni(mail.dni)
    const { data: existentes } = await admin
      .from('arrepentimientos')
      .select('id, gocuotas_order_id')
      .eq('dni', mail.dni)
    const rescateYaSolicitado = orden?.tracking
      ? (await fetchRescateYaSolicitado(orden.tracking)) ||
        (await admin.from('rescates_seguimiento').select('tracking').eq('tracking', orden.tracking).maybeSingle()).data !== null
      : false

    const accion = decidirAccionMail({
      orden,
      existentes: (existentes ?? []).map(e => ({ id: e.id, gocuotasOrderId: e.gocuotas_order_id })),
      rescateYaSolicitado,
    })

    if (accion.tipo === 'insistencia') {
      // Incremento leer+escribir: con 5-10 mails/día y un solo cron no hay carrera
      const { data: fila } = await admin.from('arrepentimientos').select('insistencias').eq('id', accion.solicitudId).single()
      const { error: err2 } = await admin
        .from('arrepentimientos')
        .update({ insistencias: (fila?.insistencias ?? 1) + 1, ultima_insistencia_at: mail.fecha })
        .eq('id', accion.solicitudId)
      if (err2) return NextResponse.json({ ok: false, resultado: err2.message }, { status: 500 })
      insistencias++
    } else if (accion.tipo === 'nueva') {
      const { error } = await admin.from('arrepentimientos').insert({
        dni: mail.dni,
        nombre: mail.nombre,
        email_uid: mail.uid,
        uidvalidity: buzon.uidValidity,
        email_fecha: mail.fecha,
        order_number: orden?.orderNumber ?? null,
        gocuotas_order_id: orden?.gocuotasOrderId ?? null,
        producto: orden?.producto ?? null,
        tracking: orden?.tracking ?? null,
        otras_ordenes: orden?.otrasOrdenes ?? 0,
        ultima_insistencia_at: mail.fecha,
      })
      // 23505 en (uidvalidity, email_uid) = reintento de un lote caído: seguir
      if (error && error.code !== '23505') {
        return NextResponse.json({ ok: false, resultado: error.message }, { status: 500 })
      }
      if (!error) nuevos++
    } else {
      yaSolicitados++
    }

    // Avanzar el cursor DESPUÉS de procesar este mail
    const { error: errCursor } = await admin
      .from('arrepentimientos_estado')
      .update({ ultimo_uid: mail.uid, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (errCursor) return NextResponse.json({ ok: false, resultado: errCursor.message }, { status: 500 })
  }

  // Si solo hubo mails descartados por filtro, avanzar el cursor igual
  if (lote.maxUid > Number(estado.ultimo_uid)) {
    await admin
      .from('arrepentimientos_estado')
      .update({ ultimo_uid: lote.maxUid, updated_at: new Date().toISOString() })
      .eq('id', 1)
  }

  // Refrescar pendientes sin tracking: el arrepentimiento suele llegar ANTES
  // del despacho — si el depósito despachó después del mail, la fila debe
  // mostrar el tracking para que Yamila pueda confirmar el rescate
  // (fix del review final; sin esto "sin despachar" quedaba congelado).
  let refrescados = 0
  const { data: sinTracking } = await admin
    .from('arrepentimientos')
    .select('id, dni, gocuotas_order_id')
    .eq('estado', 'pendiente')
    .is('tracking', null)
  for (const p of sinTracking ?? []) {
    const orden = await fetchOrdenPorDni(p.dni)
    if (!orden) continue
    // Solo refrescar la MISMA orden (o una fila "sin orden" que ahora matchea)
    if (p.gocuotas_order_id && orden.gocuotasOrderId !== p.gocuotas_order_id) continue
    if (!orden.tracking && p.gocuotas_order_id) continue
    const { error } = await admin
      .from('arrepentimientos')
      .update({
        tracking: orden.tracking,
        order_number: orden.orderNumber,
        gocuotas_order_id: orden.gocuotasOrderId,
        producto: orden.producto,
        otras_ordenes: orden.otrasOrdenes,
      })
      .eq('id', p.id)
    if (!error) refrescados++
  }

  return NextResponse.json({
    ok: true,
    resultado: `procesados ${lote.mails.length} mails del botón`,
    nuevos,
    insistencias,
    yaSolicitados,
    descartadosFiltro: lote.descartadosFiltro,
    erroresMail: lote.errores,
    refrescados,
  })
}
