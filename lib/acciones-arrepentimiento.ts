// Ruteo puro de qué acción de Andreani corresponde a una solicitud de
// arrepentimiento, según el fulfillment local (dato de caché, cada 30 min) y,
// cuando hay, el preview fresco del webhook de GOcelular/Pedro — que manda
// sobre el dato local porque es en vivo.
// Spec: .superpowers/sdd/2026-10-28-acciones-andreani-webhook/

import { FULFILLMENTS_CANCELABLES } from '@/lib/cancelaciones'

export type AccionAndreani = 'cancelar_pedido' | 'rescate' | 'solicitar_devolucion'

export type ResultadoAccion =
  | { accion: AccionAndreani; label: string }
  | { accion: 'manual'; motivo: string }
  | { accion: 'ninguna'; motivo: string }

/**
 * Ruteo por dato LOCAL (fulfillment cacheado): da el label inicial del botón
 * antes de refrescar contra el webhook. `null` = sin pedido en el warehouse,
 * típicamente porque es stock de depósito local y nunca pasó por Andreani —
 * no hay nada que gestionar ahí, corresponde anular y descartar a mano.
 */
export function resolverAccion(fulfillment: string | null): ResultadoAccion {
  if (fulfillment === null) {
    return {
      accion: 'manual',
      motivo: 'Sin pedido en el warehouse — posible depósito local: anulá la orden y descartá',
    }
  }
  if ((FULFILLMENTS_CANCELABLES as readonly string[]).includes(fulfillment)) {
    return { accion: 'cancelar_pedido', label: 'Cancelar pedido' }
  }
  if (fulfillment === 'expedido') {
    return { accion: 'rescate', label: 'Rescatar' }
  }
  if (fulfillment === 'cancelado') {
    return { accion: 'ninguna', motivo: 'El pedido ya está cancelado' }
  }
  if (fulfillment === 'cancelación pedida') {
    return { accion: 'ninguna', motivo: 'La cancelación está pendiente de confirmación de Andreani' }
  }
  if (fulfillment === 'cancelación no realizada') {
    return { accion: 'ninguna', motivo: 'Andreani rechazó la cancelación — resolver el caso a mano' }
  }
  return { accion: 'ninguna', motivo: `Estado de fulfillment sin acción conocida: ${fulfillment}` }
}

/**
 * Ruteo por el estado FRESCO que devuelve el webhook de GOcelular (preview),
 * más actualizado que nuestro fulfillment cacheado (cron cada 30 min).
 * `no_cancelable_expedido`/`no_cancelable_entregado` son los dos estados que
 * ya vimos en producción para pedidos que avanzaron más allá de lo esperado;
 * el resto se infiere por prefijo del propio contrato de Pedro.
 */
export function accionDesdeEstadoPedro(estado: string): AccionAndreani | 'manual' {
  if (estado === 'no_cancelable_expedido') return 'rescate'
  if (estado === 'no_cancelable_entregado') return 'solicitar_devolucion'
  if (estado === 'sin_pedido_wh') return 'manual'
  if (estado.startsWith('rescate')) return 'rescate'
  if (estado.startsWith('devolucion') || estado.startsWith('retiro')) return 'solicitar_devolucion'
  return 'manual'
}
