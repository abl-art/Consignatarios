'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCancelacionWebhook, getCancelacionEstado } from '@/lib/gocelular-webhook'
import { puedeCancelarPedido, esCancelacionConfirmada, interpretarPreview, MOTIVO_ARREPENTIMIENTO } from '@/lib/cancelaciones'

function resumen(body: Record<string, unknown> | null): string {
  if (!body) return 'sin detalle'
  return JSON.stringify(body).slice(0, 400)
}

async function cargarArrep(id: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('arrepentimientos')
    .select('estado, order_number, fulfillment, cancelacion_wh_at')
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
    .update({ cancelacion_wh_at: new Date().toISOString(), cancelacion_wh_detalle: resumen(res.body) })
    .eq('id', id)
  revalidatePath('/compras/envios')
  return { ok: true }
}

/**
 * Polling post-apply (Andreani resuelve en ~1 min): cuando el GET dice
 * `cancelado`, el fulfillment local pasa a cancelado para que la fila lo
 * refleje al instante (el cron lo confirmaría recién a los 30 min).
 */
export async function confirmarCancelacionPedido(id: string): Promise<{ estado: string; confirmada: boolean; error?: string }> {
  const { admin, fila } = await cargarArrep(id)
  if (!fila?.order_number) return { estado: 'desconocido', confirmada: false, error: 'Solicitud sin orden.' }

  const res = await getCancelacionEstado({ order_number: fila.order_number })
  const estado = (res.body?.estado ?? res.body?.resultado ?? 'desconocido') as string
  if (!esCancelacionConfirmada(estado)) return { estado, confirmada: false }

  await admin.from('arrepentimientos').update({ fulfillment: 'cancelado' }).eq('id', id)
  revalidatePath('/compras/envios')
  return { estado, confirmada: true }
}
