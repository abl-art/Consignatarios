import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decidirAccionMail, etiquetaFulfillment, evaluarVentanaArrepentimiento } from '@/lib/arrepentimientos'
import { leerEstadoBuzon, leerMailsNuevos } from '@/lib/arrepentimientos-mail'
import { fetchEstadoOrdenGocuotas, fetchFulfillmentPedido, fetchOrdenPorDni, fetchRescateYaSolicitado } from '@/lib/gocelular'

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
  let autoDescartados = 0

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
      // Ventana de arrepentimiento (solo con orden identificada; sin orden
      // queda pendiente para que Yamila investigue): compra sin confirmar o
      // con más de 10 días desde la confirmación → se inserta ya descartada
      // (no aparece en pendientes pero queda la traza y dedupea insistencias)
      const ventana = orden ? evaluarVentanaArrepentimiento(orden.deliveredAt, mail.fecha) : 'vigente'
      const autoDescarte =
        ventana === 'vencida'
          ? 'Gestionado por otro canal'
          : ventana === 'no_aprobada'
            ? 'Compra no aprobada'
            : null

      const { error } = await admin.from('arrepentimientos').insert({
        dni: mail.dni,
        nombre: mail.nombre,
        email_uid: mail.uid,
        uidvalidity: buzon.uidValidity,
        email_fecha: mail.fecha,
        order_number: orden?.orderNumber ?? null,
        gocuotas_order_id: orden?.gocuotasOrderId ?? null,
        gocuotas_status: orden?.gocuotasStatus ?? null,
        fulfillment: orden ? etiquetaFulfillment(orden) : null,
        producto: orden?.producto ?? null,
        tracking: orden?.tracking ?? null,
        otras_ordenes: orden?.otrasOrdenes ?? 0,
        ultima_insistencia_at: mail.fecha,
        ...(autoDescarte && {
          estado: 'descartada',
          descarte_motivo: autoDescarte,
          resuelto_at: new Date().toISOString(),
        }),
      })
      // 23505 en (uidvalidity, email_uid) = reintento de un lote caído: seguir
      if (error && error.code !== '23505') {
        return NextResponse.json({ ok: false, resultado: error.message }, { status: 500 })
      }
      if (!error) {
        if (autoDescarte) autoDescartados++
        else nuevos++
      }
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

  // Refrescar pendientes contra la réplica en cada corrida:
  // - tracking de las sin despachar (el despacho suele salir DESPUÉS del
  //   mail; sin esto "sin despachar" quedaba congelado — fix del review);
  // - estado de la orden GOcuotas de TODAS (cuando Yamila anula la orden,
  //   la fila pasa sola a "anulada" — lookup sin filtro de descartadas);
  // - pipeline de fulfillment de TODAS (en cola → enviado a Andreani →
  //   pickeado: si avanzó, Yamila sabe que hay que frenar el picking).
  let refrescados = 0
  const { data: pendRows } = await admin
    .from('arrepentimientos')
    .select('id, dni, tracking, order_number, gocuotas_order_id, gocuotas_status, fulfillment')
    .eq('estado', 'pendiente')
  for (const p of pendRows ?? []) {
    const update: Record<string, unknown> = {}
    if (p.gocuotas_order_id) {
      const status = await fetchEstadoOrdenGocuotas(p.gocuotas_order_id)
      if (status && status !== p.gocuotas_status) update.gocuotas_status = status
    }
    if (p.order_number) {
      const ful = await fetchFulfillmentPedido(p.order_number)
      const etiqueta = ful ? etiquetaFulfillment(ful) : null
      if (etiqueta && etiqueta !== p.fulfillment) update.fulfillment = etiqueta
    }
    if (!p.tracking) {
      const orden = await fetchOrdenPorDni(p.dni)
      // Solo refrescar la MISMA orden (o una fila "sin orden" que ahora matchea)
      if (orden && (!p.gocuotas_order_id || orden.gocuotasOrderId === p.gocuotas_order_id) && (orden.tracking || !p.gocuotas_order_id)) {
        update.tracking = orden.tracking
        update.order_number = orden.orderNumber
        update.gocuotas_order_id = orden.gocuotasOrderId
        update.gocuotas_status = orden.gocuotasStatus
        update.fulfillment = etiquetaFulfillment(orden)
        update.producto = orden.producto
        update.otras_ordenes = orden.otrasOrdenes
      }
    }
    if (Object.keys(update).length === 0) continue
    const { error } = await admin.from('arrepentimientos').update(update).eq('id', p.id)
    if (!error) refrescados++
  }

  return NextResponse.json({
    ok: true,
    resultado: `procesados ${lote.mails.length} mails del botón`,
    nuevos,
    insistencias,
    yaSolicitados,
    autoDescartados,
    descartadosFiltro: lote.descartadosFiltro,
    erroresMail: lote.errores,
    refrescados,
  })
}
