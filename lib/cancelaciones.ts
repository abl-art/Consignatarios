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
        : s.fulfillment === 'cancelación no realizada' ? 'Andreani la rechazó — queda solo el reintento por mail; el caso va a rescate cuando expida'
        : 'Sin pedido en el circuito del warehouse',
    }
  }
  return { ok: true }
}

export function validarMotivo(motivo: string): boolean {
  const l = motivo.trim().length
  return l >= 10 && l <= 500
}

export type AccionCancelacion = 'cancelar_pedido' | 'cancelar_orden' | 'solicitar_devolucion'
export type ModalidadDevolucion = 'domicilio' | 'sucursal'

export interface PayloadCancelacion {
  mode: 'preview' | 'apply'
  accion: AccionCancelacion
  order_number: string
  motivo: string
  source: '360'
  modalidad?: ModalidadDevolucion
  ventana?: { inicio: string; fin: string }
}

/**
 * Arma el payload exacto del POST de cancelaciones (contrato 29/10):
 * `modalidad` es obligatoria en solicitar_devolucion y PROHIBIDA en las otras
 * acciones — Pedro rechaza cualquier campo desconocido con 400, así que las
 * claves condicionales no pueden viajar ni en undefined.
 */
export function construirPayloadCancelacion(input: {
  mode: 'preview' | 'apply'
  accion: AccionCancelacion
  orderNumber: string
  motivo: string
  modalidad?: ModalidadDevolucion
  ventana?: { inicio: string; fin: string }
}): { ok: true; payload: PayloadCancelacion } | { ok: false; error: string } {
  if (!validarMotivo(input.motivo)) return { ok: false, error: 'El motivo debe tener entre 10 y 500 caracteres.' }
  if (input.accion === 'solicitar_devolucion' && !input.modalidad) {
    return { ok: false, error: 'La devolución necesita modalidad: domicilio o sucursal.' }
  }
  if (input.accion !== 'solicitar_devolucion' && (input.modalidad || input.ventana)) {
    return { ok: false, error: `modalidad/ventana solo valen para solicitar_devolucion (acción: ${input.accion}).` }
  }
  const payload: PayloadCancelacion = {
    mode: input.mode,
    accion: input.accion,
    order_number: input.orderNumber,
    motivo: input.motivo,
    source: '360',
  }
  if (input.accion === 'solicitar_devolucion') {
    payload.modalidad = input.modalidad
    if (input.ventana) payload.ventana = input.ventana
  }
  return { ok: true, payload }
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
 * Traduce el GET de cancelaciones a la etiqueta local de fulfillment (regla
 * de Emiliano 27/10): `canal: mail` significa que Andreani RECHAZÓ el intento
 * por API y queda solo el reintento por mail (pocas chances) → "cancelación
 * no realizada", no "pendiente". `no_cancelable_expedido` pasa la fila a
 * expedido para resolverla con Confirmar (rescate). null = no tocar.
 */
export function etiquetaDesdeGetCancelacion(body: { estado?: string; canal?: string | null } | null): string | null {
  if (!body?.estado) return null
  if (body.estado === 'cancelado') return 'cancelado'
  if (body.estado === 'no_cancelable_expedido') return 'expedido'
  if (body.estado === 'requiere_atencion') return 'cancelación no realizada'
  if (body.estado === 'cancelacion_pedida') return body.canal === 'mail' ? 'cancelación no realizada' : 'cancelación pedida'
  return null
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
