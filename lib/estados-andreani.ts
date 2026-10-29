/**
 * Pure-logic module for mapping Andreani webhook states (rescate/devolución)
 * to local chip labels and status classes.
 *
 * No side effects, no network, no Supabase.
 */

export type ClaseEstado = 'ok' | 'mal' | 'pendiente'

// Rescate states → human-readable labels
const ETIQUETAS_RESCATE: Record<string, string> = {
  rescate_pedido: 'rescate pedido',
  rescate_confirmado: 'rescate confirmado',
  rescate_recibido: 'rescate recibido',
  rescate_rechazado: 'rescate rechazado',
}

// Devolución states → human-readable labels
const ETIQUETAS_DEVOLUCION: Record<string, string> = {
  devolucion_pedida: 'devolución pedida',
  retiro_solicitado: 'retiro solicitado',
  retiro_confirmado: 'retiro confirmado',
  retiro_realizado: 'retiro realizado',
  retiro_fallido: 'retiro fallido',
  devolucion_recibida: 'devolución recibida',
}

/**
 * Classifies a rescate (rescue) state into ok/mal/pendiente.
 * @param estado State string from Pedro's backend (or null if unknown/not yet reported)
 * @returns 'ok' if rescate_recibido; 'mal' if rescate_rechazado; 'pendiente' otherwise (incl. null/unknown)
 */
export function claseRescate(estado: string | null): ClaseEstado {
  if (estado === 'rescate_recibido') return 'ok'
  if (estado === 'rescate_rechazado') return 'mal'
  return 'pendiente'
}

/**
 * Classifies a devolución (return) state into ok/mal/pendiente.
 * @param estado State string from Pedro's backend (or null if unknown/not yet reported)
 * @returns 'ok' if devolucion_recibida; 'mal' if retiro_fallido; 'pendiente' otherwise (incl. null/unknown)
 */
export function claseDevolucion(estado: string | null): ClaseEstado {
  if (estado === 'devolucion_recibida') return 'ok'
  if (estado === 'retiro_fallido') return 'mal'
  return 'pendiente'
}

/**
 * Maps a rescate state to its human-readable chip label.
 * @param estado State string from Pedro's backend (or null)
 * @returns Human-readable label if known; null if estado is null; raw string unchanged if unknown (never throws, never null for non-null input)
 *
 * Review Focus: Unknown states are returned raw, allowing UI to display them and alerting devs to new states from Pedro.
 */
export function etiquetaRescate(estado: string | null): string | null {
  if (estado === null) return null
  return ETIQUETAS_RESCATE[estado] ?? estado
}

/**
 * Maps a devolución state to its human-readable chip label.
 * @param estado State string from Pedro's backend (or null)
 * @returns Human-readable label if known; null if estado is null; raw string unchanged if unknown (never throws, never null for non-null input)
 *
 * Review Focus: Unknown states are returned raw, allowing UI to display them and alerting devs to new states from Pedro.
 */
export function etiquetaDevolucion(estado: string | null): string | null {
  if (estado === null) return null
  return ETIQUETAS_DEVOLUCION[estado] ?? estado
}

// Estados terminales del circuito de devolución en Andreani (equipo de
// vuelta en origen). Mismos valores que ESTADOS_TERMINALES en
// lib/actions/devoluciones.ts — si Andreani cambia su wording hay que
// actualizar ambos.
const ANDREANI_TERMINALES = ['Devuelto', 'Entregado']

/**
 * Compara el estado de Andreani (fuente de verdad del tránsito físico) con
 * el estado reportado por Pedro (webhook de GOcelular) para una devolución,
 * y señala cuándo Pedro ya dio el equipo por recibido pero Andreani todavía
 * no lo refleja. Control v1: solo cubre ese caso concreto (no un mapa
 * genérico de estados).
 * @param andreani Estado actual del tramo de devolución en Andreani (o null si no se consultó)
 * @param pedro Estado crudo reportado por Pedro vía webhook (o null si no se consultó)
 * @returns Mensaje de discrepancia, o null si no aplica o falta algún dato
 */
export function banderaDiscrepancia(andreani: string | null, pedro: string | null): string | null {
  if (andreani === null || pedro === null) return null
  const pedroRecibido = pedro === 'rescate_recibido' || pedro === 'devolucion_recibida'
  const andreaniDevuelto = ANDREANI_TERMINALES.includes(andreani)
  if (pedroRecibido && !andreaniDevuelto) {
    return 'Pedro marca el equipo recibido pero Andreani no lo refleja todavía'
  }
  return null
}
