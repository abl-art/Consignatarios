// Cancelación de pedidos del warehouse vía la API de GOcelular (novedades de
// Pedro, 27/10/2026): POST/GET a /api/webhooks/gocelular/cancelaciones con la
// firma HMAC de siempre. cancelar_pedido frena el envío en Andreani y la
// orden de GOcuotas sigue viva (el refund es el botón Anular orden).
// Lógica pura — el fetch firmado vive en lib/gocelular-webhook.ts.

export const MOTIVO_ARREPENTIMIENTO = 'Arrepentimiento del cliente — solicitado desde GOcelular360'

export const FULFILLMENTS_CANCELABLES = ['en cola', 'enviado a Andreani', 'pickeado'] as const

/** Guard del botón "Cancelar pedido": pendiente, con orden, y el pedido en el circuito del warehouse. */
export function puedeCancelarPedido(s: {
  estado: string
  orderNumber: string | null
  fulfillment: string | null
}): { ok: true } | { ok: false; error: string } {
  if (s.estado !== 'pendiente') return { ok: false, error: 'La solicitud ya fue resuelta' }
  if (!s.orderNumber) return { ok: false, error: 'Sin orden identificada' }
  if (!s.fulfillment || !(FULFILLMENTS_CANCELABLES as readonly string[]).includes(s.fulfillment)) {
    return {
      ok: false,
      error: s.fulfillment === 'expedido' ? 'Ya salió del depósito: corresponde rescate'
        : s.fulfillment === 'cancelado' ? 'El pedido ya está cancelado'
        : s.fulfillment === 'cancelación pedida' ? 'La cancelación ya fue pedida — pendiente de confirmación de Andreani'
        : 'Sin pedido en el circuito del warehouse',
    }
  }
  return { ok: true }
}

export function validarMotivo(motivo: string): boolean {
  const l = motivo.trim().length
  return l >= 10 && l <= 500
}

/**
 * Regla de reintento del contrato: `vivo` y `sin_pedido_wh` se reintentan en
 * unos minutos; un 409 NO se reintenta salvo que traiga retryable true; 5xx
 * (incl. 503 refund_disabled) se puede reintentar más tarde.
 */
export function esReintentable(status: number, body: { resultado?: string; retryable?: boolean } | null): boolean {
  if (status === 409) return body?.retryable === true
  if (status >= 500) return true
  if (status === 200 && (body?.resultado === 'vivo' || body?.resultado === 'sin_pedido_wh')) return true
  return false
}

/** El estado del GET que cierra el ciclo. */
export function esCancelacionConfirmada(estado: string | null | undefined): boolean {
  return estado === 'cancelado'
}

/**
 * Estados terminales del GET (contrato de Pedro 27/10): `cancelado` cierra
 * bien; `requiere_atencion` y `no_cancelable_expedido` cierran MAL — la
 * cancelación fue rechazada y NO corresponde anular la orden todavía.
 * `cancelacion_pedida` sigue pendiente de Andreani.
 */
export function veredictoCancelacion(estado: string | null | undefined): 'confirmada' | 'rechazada' | 'pendiente' {
  if (estado === 'cancelado') return 'confirmada'
  if (estado === 'requiere_atencion' || estado === 'no_cancelable_expedido') return 'rechazada'
  return 'pendiente'
}

/**
 * El preview de Pedro es más fresco que nuestro fulfillment (cron cada 30
 * min): si responde no_cancelable_* o sin_pedido_wh, el apply no corresponde.
 */
export function interpretarPreview(body: { resultado?: string } | null): { cancelable: boolean; motivo: string } {
  const r = body?.resultado ?? 'desconocido'
  if (r.startsWith('no_cancelable')) return { cancelable: false, motivo: `GOcelular responde ${r} — el pedido ya no se puede cancelar (refrescá la fila)` }
  if (r === 'sin_pedido_wh') return { cancelable: false, motivo: 'GOcelular no encuentra pedido en el warehouse — reintentá en unos minutos' }
  return { cancelable: true, motivo: r }
}
