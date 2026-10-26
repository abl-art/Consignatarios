// Buscador de TACs del catálogo público (/catalogo): un merchant carga un TAC
// (los primeros 8 dígitos del IMEI) y sabe si ese modelo se puede vender con
// GOcelular. La verdad sale de la base de devices enrolados: si el TAC ya
// operó con Trustonic (ready_for_use/active/locked/released) el modelo está
// habilitado; si no (TAC sin cargar en Trustonic —non_enrollable_tacs—, visto
// solo pendiente/inactivo, o nunca visto) falta solicitar la carga.

/** Estados de trustonic_status que prueban que el TAC es operable. */
export const ESTADOS_VENDIBLES = ['ready_for_use', 'active', 'locked', 'released'] as const

export type MotivoTac = 'ok' | 'lista_negra' | 'sin_estados_validos' | 'desconocido'

export interface EvaluacionTac {
  vendible: boolean
  motivo: MotivoTac
  /** Equipos con estado operable vistos en la base */
  equiposOk: number
}

/**
 * Normaliza lo que tipea el merchant: acepta el TAC solo (8 dígitos) o el
 * IMEI completo (15 — se queda con los primeros 8), con puntos, espacios o
 * guiones en el medio. Menos de 8 dígitos no identifica un TAC.
 */
export function normalizarTac(input: string): string | null {
  const digitos = input.replace(/\D/g, '')
  if (digitos.length < 8) return null
  return digitos.slice(0, 8)
}

export function evaluarTac(datos: {
  estados: { status: string; count: number }[]
  enListaNegra: boolean
}): EvaluacionTac {
  const equiposOk = datos.estados
    .filter(e => (ESTADOS_VENDIBLES as readonly string[]).includes(e.status))
    .reduce((s, e) => s + e.count, 0)
  // Un equipo operando prueba que el TAC ya está cargado en Trustonic — gana
  // aunque el TAC figure en non_enrollable_tacs (esa lista marca intentos
  // viejos de enrolar un TAC aún sin cargar, no una incompatibilidad)
  if (equiposOk > 0) return { vendible: true, motivo: 'ok', equiposOk }
  if (datos.enListaNegra) return { vendible: false, motivo: 'lista_negra', equiposOk: 0 }
  if (datos.estados.length > 0) return { vendible: false, motivo: 'sin_estados_validos', equiposOk: 0 }
  return { vendible: false, motivo: 'desconocido', equiposOk: 0 }
}
