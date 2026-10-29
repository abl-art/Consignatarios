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
  if (estado === 'sin_pedido_wh' || estado === 'no_es_wh') return 'manual'
  if (estado.startsWith('rescate')) return 'rescate'
  if (estado.startsWith('devolucion') || estado.startsWith('retiro')) return 'solicitar_devolucion'
  return 'manual'
}

export type RuteoPreview =
  | { tipo: 'go'; accion: AccionAndreani; label: string }
  | { tipo: 'reintentar'; motivo: string }
  | { tipo: 'manual'; motivo: string }
  | { tipo: 'ninguna'; motivo: string }

/**
 * Ruteo del RESULTADO del preview (mode: preview = "qué haría apply") al
 * estado del botón inteligente, según el contrato completo de Pedro (29/10,
 * docs/gocelular-cancelaciones-api.md). El rescate NO es una acción propia
 * del POST: un apply de cancelar_pedido sobre un expedido lo pide solo
 * (rescate automático), por eso `no_cancelable_expedido` es un GO.
 */
export function rutearPreview(resultado: string | null): RuteoPreview {
  switch (resultado) {
    case 'cancelacion_pedida':
    case 'cancelacion_pedida_por_mail':
      return { tipo: 'go', accion: 'cancelar_pedido', label: 'Cancelar pedido' }
    case 'cancelado':
      // Verificado contra prod (SO-FGDU2R, 29/10): el preview de una acción ya
      // hecha devuelve el estado VIGENTE, no una proyección.
      return { tipo: 'ninguna', motivo: 'El pedido ya está cancelado en el warehouse' }
    case 'no_cancelable_expedido':
      return { tipo: 'go', accion: 'rescate', label: 'Pedir rescate' }
    case 'no_cancelable_entregado':
      return { tipo: 'go', accion: 'solicitar_devolucion', label: 'Pedir devolución' }
    case 'rescate_pedido':
    case 'rescate_confirmado':
    case 'rescate_recibido':
      return { tipo: 'ninguna', motivo: 'Rescate ya en curso — se sigue en la pestaña Rescates' }
    case 'rescate_rechazado':
      return { tipo: 'manual', motivo: 'Andreani rechazó el rescate — lo resuelve un operador de GOcelular; si el paquete llega al cliente, corresponde devolución' }
    case 'devolucion_pedida':
    case 'retiro_solicitado':
    case 'retiro_confirmado':
    case 'retiro_realizado':
    case 'devolucion_recibida':
      return { tipo: 'ninguna', motivo: 'Devolución ya en curso — se sigue en la pestaña Devoluciones' }
    case 'retiro_fallido':
      return { tipo: 'manual', motivo: 'Andreani no pudo retirar el paquete — lo revisa un operador de GOcelular' }
    case 'vivo':
      return { tipo: 'reintentar', motivo: 'El pedido sigue activo y todavía no se pudo cancelar — reintentá en unos minutos' }
    case 'sin_pedido_wh':
      return { tipo: 'reintentar', motivo: 'La orden está paga pero el pedido del warehouse todavía no se creó — reintentá en unos minutos' }
    case 'no_es_wh':
      return { tipo: 'manual', motivo: 'Sin pedido en Andreani (stock local o equipo ya asignado) — nada que cancelar en el depósito: anulá la orden y descartá' }
    case 'requiere_atencion':
      return { tipo: 'manual', motivo: 'El pedido está en la cola de un operador de GOcelular — esperá su resolución' }
    default:
      return { tipo: 'manual', motivo: `GOcelular respondió un estado desconocido (${resultado ?? 'sin resultado'}) — resolver a mano` }
  }
}
