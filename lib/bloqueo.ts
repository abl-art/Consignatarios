// ─── Filtro por solución de bloqueo (Knox / Motosafe / DLC) ───────────────
// La solución de bloqueo se define por MARCA del equipo (regla de Emiliano):
//   Knox     = todos los Samsung (devices.brand 'Samsung', 'Samsung Korea', ...)
//   Motosafe = todos los Motorola
//   DLC      = todas las demás marcas (Xiaomi, ZTE, Nubia, ...)
// La marca sale de devices.brand (única fuente que cubre venta propia Y
// terceros); devices.lock_solution viene null en más de la mitad de las filas.
// Las órdenes sin equipo en devices (~1%) quedan fuera cuando hay filtro.

export const BLOQUEOS = ['knox', 'motosafe', 'dlc'] as const
export type Bloqueo = (typeof BLOQUEOS)[number]

export interface FiltrosIndicadoresSql {
  bloqueo?: Bloqueo
  storeIds?: string[]
}

// MIN(brand) por orden evita el fan-out de órdenes con más de un device
// (existe una anómala con 308) sin duplicar cuotas en los SUM.
const JOIN_MARCA = `JOIN (SELECT order_id, MIN(brand) AS brand FROM devices GROUP BY order_id) marca_dev ON marca_dev.order_id = o.order_id::text`

const PREDICADO_BLOQUEO: Record<Bloqueo, string> = {
  knox: `marca_dev.brand ILIKE 'samsung%'`,
  motosafe: `marca_dev.brand ILIKE 'motorola%'`,
  dlc: `marca_dev.brand IS NOT NULL AND marca_dev.brand NOT ILIKE 'samsung%' AND marca_dev.brand NOT ILIKE 'motorola%'`,
}

/**
 * Arma el JOIN y las cláusulas AND extra para filtrar las queries de
 * PD/DPD/Vintage por solución de bloqueo y/o store. Todo lo interpolado
 * pasa por whitelist (enum para bloqueo, /^\d+$/ para store ids) porque
 * estas queries no usan placeholders.
 */
export function sqlFiltrosIndicadores(filtros?: FiltrosIndicadoresSql): { join: string; where: string } {
  if (!filtros) return { join: '', where: '' }

  let join = ''
  const condiciones: string[] = []

  if (filtros.bloqueo && (BLOQUEOS as readonly string[]).includes(filtros.bloqueo)) {
    join = JOIN_MARCA
    condiciones.push(`AND (${PREDICADO_BLOQUEO[filtros.bloqueo]})`)
  }

  const storesSeguras = (filtros.storeIds ?? []).filter(id => /^\d+$/.test(id))
  if (storesSeguras.length > 0) {
    condiciones.push(`AND o.store_id::text IN (${storesSeguras.map(id => `'${id}'`).join(', ')})`)
  }

  return { join, where: condiciones.join('\n      ') }
}
