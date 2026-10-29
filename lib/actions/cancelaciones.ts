'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCancelacionWebhook, getCancelacionEstado } from '@/lib/gocelular-webhook'
import {
  puedeCancelarPedido,
  etiquetaDesdeGetCancelacion,
  interpretarPreview,
  construirPayloadCancelacion,
  MOTIVO_ARREPENTIMIENTO,
  type ModalidadDevolucion,
} from '@/lib/cancelaciones'
import { rutearPreview, type RuteoPreview } from '@/lib/acciones-arrepentimiento'
import { cargarRescate } from '@/lib/actions/rescates'

function resumen(body: Record<string, unknown> | null): string {
  if (!body) return 'sin detalle'
  return JSON.stringify(body).slice(0, 400)
}

// Los interruptores de Pedro arrancan apagados: preview/GET andan, apply da
// 503. El mensaje le dice a Yami que no es un error suyo.
function errorAmigable(status: number, body: Record<string, unknown> | null): string {
  const code = body?.code as string | undefined
  if (status === 503 && (code === 'integration_disabled' || code === 'refund_disabled')) {
    return 'La integración está apagada del lado de GOcelular (fase de integración) — gestioná con Confirmar (registro local) o reintentá más tarde.'
  }
  if (status === 409 && code === 'no_habilitado') {
    return 'La devolución por API todavía no está habilitada del lado de GOcelular — no se agendó ningún retiro. Gestionala a mano por ahora.'
  }
  return `GOcelular respondió ${status}: ${resumen(body)}`
}

async function cargarArrep(id: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('arrepentimientos')
    .select('estado, order_number, tracking, fulfillment, cancelacion_wh_at, rescate_wh_at, devolucion_wh_at')
    .eq('id', id)
    .single()
  return { admin, fila: data }
}

/** Primer clic del botón: preview de Pedro — muestra qué pasaría sin tocar nada. */
export async function previewCancelarPedido(id: string): Promise<{ ok?: true; mensaje?: string; error?: string }> {
  const { fila } = await cargarArrep(id)
  if (!fila) return { error: 'Solicitud no encontrada.' }
  const guard = puedeCancelarPedido({ estado: fila.estado, orderNumber: fila.order_number, fulfillment: fila.fulfillment })
  if (!guard.ok) return { error: guard.error }

  const res = await sendCancelacionWebhook({
    mode: 'preview',
    accion: 'cancelar_pedido',
    order_number: fila.order_number!,
    motivo: MOTIVO_ARREPENTIMIENTO,
    source: '360',
  })
  if (!res.ok) return { error: `Preview falló (${res.status}): ${resumen(res.body)}` }
  const veredicto = interpretarPreview(res.body)
  if (!veredicto.cancelable) return { error: veredicto.motivo }
  return { ok: true, mensaje: resumen(res.body) }
}

/** Segundo clic: apply. El resultado es asincrónico — confirmar con confirmarCancelacionPedido. */
export async function aplicarCancelarPedido(id: string): Promise<{ ok?: true; error?: string }> {
  const { admin, fila } = await cargarArrep(id)
  if (!fila) return { error: 'Solicitud no encontrada.' }
  if (fila.cancelacion_wh_at) return { error: 'La cancelación ya fue solicitada — esperá la confirmación.' }
  const guard = puedeCancelarPedido({ estado: fila.estado, orderNumber: fila.order_number, fulfillment: fila.fulfillment })
  if (!guard.ok) return { error: guard.error }

  const res = await sendCancelacionWebhook({
    mode: 'apply',
    accion: 'cancelar_pedido',
    order_number: fila.order_number!,
    motivo: MOTIVO_ARREPENTIMIENTO,
    source: '360',
  })
  if (!res.ok) return { error: `La cancelación falló (${res.status}): ${resumen(res.body)}` }

  await admin
    .from('arrepentimientos')
    .update({
      cancelacion_wh_at: new Date().toISOString(),
      cancelacion_wh_detalle: resumen(res.body),
      // pendiente de Andreani desde ya — el chip lo dice y Anular orden se bloquea
      fulfillment: 'cancelación pedida',
    })
    .eq('id', id)
  revalidatePath('/compras/envios')
  return { ok: true }
}

/**
 * Polling post-apply (Andreani resuelve en ~1 min): cuando el GET dice
 * `cancelado`, el fulfillment local pasa a cancelado para que la fila lo
 * refleje al instante (el cron lo confirmaría recién a los 30 min).
 */
export async function confirmarCancelacionPedido(
  id: string,
): Promise<{ estado: string; veredicto: 'confirmada' | 'rechazada' | 'pendiente'; error?: string }> {
  const { admin, fila } = await cargarArrep(id)
  if (!fila?.order_number) return { estado: 'desconocido', veredicto: 'pendiente', error: 'Solicitud sin orden.' }

  const res = await getCancelacionEstado({ order_number: fila.order_number })
  const estado = (res.body?.estado ?? res.body?.resultado ?? 'desconocido') as string
  const etiqueta = etiquetaDesdeGetCancelacion(res.body as { estado?: string; canal?: string | null } | null)

  if (etiqueta && etiqueta !== fila.fulfillment) {
    await admin.from('arrepentimientos').update({ fulfillment: etiqueta }).eq('id', id)
    revalidatePath('/compras/envios')
  }

  const veredicto: 'confirmada' | 'rechazada' | 'pendiente' =
    etiqueta === 'cancelado' ? 'confirmada'
    : etiqueta === 'expedido' || etiqueta === 'cancelación no realizada' ? 'rechazada'
    : 'pendiente'
  return { estado, veredicto }
}

// ── Botón inteligente: rescate y devolución por el webhook (contrato 29/10) ──

/**
 * Primer clic del botón inteligente: preview genérico de cancelar_pedido —
 * Pedro responde el estado real del pedido (más fresco que nuestro
 * fulfillment) y rutearPreview decide qué acción corresponde. El rescate es
 * automático: un apply de cancelar_pedido sobre un expedido lo pide solo.
 */
export async function previewAccionAndreani(
  id: string,
): Promise<{ ruteo?: RuteoPreview; mensaje?: string; error?: string }> {
  const { fila } = await cargarArrep(id)
  if (!fila) return { error: 'Solicitud no encontrada.' }
  if (fila.estado !== 'pendiente') return { error: 'La solicitud ya fue resuelta.' }
  if (!fila.order_number) return { error: 'Sin orden identificada.' }
  if (fila.rescate_wh_at) return { ruteo: { tipo: 'ninguna', motivo: 'El rescate ya fue pedido por webhook — se sigue en la pestaña Rescates' } }
  if (fila.devolucion_wh_at) return { ruteo: { tipo: 'ninguna', motivo: 'La devolución ya fue pedida por webhook — se sigue en la pestaña Devoluciones' } }

  const res = await sendCancelacionWebhook({
    mode: 'preview',
    accion: 'cancelar_pedido',
    order_number: fila.order_number,
    motivo: MOTIVO_ARREPENTIMIENTO,
    source: '360',
  })
  if (!res.ok) return { error: errorAmigable(res.status, res.body) }

  // El preview es ambiguo para rescate_* (proyección vs vigente, caso real
  // SO-ANF39G): el GET desambigua — bloque rescate ausente = proyección → GO.
  const resultado = res.body?.resultado ?? null
  let rescateVigente: boolean | undefined
  if (resultado?.startsWith('rescate')) {
    const est = await getCancelacionEstado({ order_number: fila.order_number }, { timeoutMs: 5000 })
    if (est.ok) rescateVigente = est.body?.rescate != null
  }
  return { ruteo: rutearPreview(resultado, { rescateVigente }), mensaje: resumen(res.body) }
}

/**
 * Apply de la rama rescate: POST cancelar_pedido sobre el expedido (rescate
 * automático de Pedro). Si sale, el arrepentimiento se cierra (decisión de
 * Emiliano: el apply es el gesto con el que Yami pasa al siguiente) y el caso
 * queda en la pestaña Rescates vía cargarRescate. Idempotente por rescate_wh_at.
 */
export async function aplicarRescateAndreani(id: string): Promise<{ ok?: true; error?: string }> {
  const { admin, fila } = await cargarArrep(id)
  if (!fila) return { error: 'Solicitud no encontrada.' }
  if (fila.estado !== 'pendiente') return { error: 'La solicitud ya fue resuelta.' }
  if (!fila.order_number) return { error: 'Sin orden identificada.' }
  if (fila.rescate_wh_at) return { error: 'El rescate ya fue pedido — se sigue en la pestaña Rescates.' }

  const res = await sendCancelacionWebhook({
    mode: 'apply',
    accion: 'cancelar_pedido',
    order_number: fila.order_number,
    motivo: MOTIVO_ARREPENTIMIENTO,
    source: '360',
  })
  if (!res.ok) return { error: errorAmigable(res.status, res.body) }

  const resultado = res.body?.resultado ?? 'desconocido'
  // Solo un resultado del vocabulario de rescate confirma que el pedido salió:
  // no_cancelable_entregado = se entregó en el medio (corresponde devolución);
  // no_cancelable_expedido = el rescate automático está apagado y no se pidió nada.
  if (!resultado.startsWith('rescate')) {
    if (resultado === 'no_cancelable_entregado') {
      return { error: 'El paquete ya se entregó al cliente — corresponde pedir la devolución (volvé a consultar).' }
    }
    if (resultado === 'no_cancelable_expedido') {
      return { error: 'El rescate automático está apagado del lado de GOcelular — gestioná con Confirmar (registro local) por ahora.' }
    }
    return { error: `GOcelular no pidió el rescate (resultado: ${resultado}) — ${resumen(res.body)}` }
  }

  await admin
    .from('arrepentimientos')
    .update({
      rescate_wh_at: new Date().toISOString(),
      rescate_wh_detalle: resumen(res.body),
      estado: 'confirmada',
      resuelto_at: new Date().toISOString(),
    })
    .eq('id', id)
  // La pestaña Rescates se alimenta del tracking de salida (igual que Confirmar)
  if (fila.tracking) await cargarRescate(fila.tracking, 'Arrepentimiento')
  revalidatePath('/compras/envios')
  return { ok: true }
}

/**
 * Apply de la rama devolución: solicitar_devolucion con la modalidad que
 * eligió Yami (sin ventana en v1: Pedro agenda el próximo día hábil 9-18).
 * Persiste la devolución pedida en devoluciones_pedidas (origen de la fila
 * sintética de la pestaña Devoluciones hasta que la réplica refleje el envío
 * inverso) y cierra el arrepentimiento. Idempotente por devolucion_wh_at.
 */
export async function aplicarDevolucionAndreani(
  id: string,
  modalidad: ModalidadDevolucion,
): Promise<{ ok?: true; error?: string }> {
  const { admin, fila } = await cargarArrep(id)
  if (!fila) return { error: 'Solicitud no encontrada.' }
  if (fila.estado !== 'pendiente') return { error: 'La solicitud ya fue resuelta.' }
  if (!fila.order_number) return { error: 'Sin orden identificada.' }
  if (fila.devolucion_wh_at) return { error: 'La devolución ya fue pedida — se sigue en la pestaña Devoluciones.' }

  const armado = construirPayloadCancelacion({
    mode: 'apply',
    accion: 'solicitar_devolucion',
    orderNumber: fila.order_number,
    motivo: MOTIVO_ARREPENTIMIENTO,
    modalidad,
  })
  if (!armado.ok) return { error: armado.error }

  const res = await sendCancelacionWebhook(armado.payload)
  if (!res.ok) return { error: errorAmigable(res.status, res.body) }

  const devolucion = res.body?.devolucion ?? null
  await admin
    .from('arrepentimientos')
    .update({
      devolucion_wh_at: new Date().toISOString(),
      devolucion_wh_detalle: resumen(res.body),
      estado: 'confirmada',
      resuelto_at: new Date().toISOString(),
    })
    .eq('id', id)
  await admin.from('devoluciones_pedidas').upsert(
    {
      order_number: fila.order_number,
      modalidad,
      tracking: devolucion?.tracking ?? null,
      estado: devolucion?.estado ?? res.body?.resultado ?? null,
      request_id: (res.body?.request_id as string | undefined) ?? null,
      detalle: resumen(res.body),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'order_number' },
  )
  revalidatePath('/compras/envios')
  return { ok: true }
}
