// ─── Client IDs centralizados ─────────────────────────────────────────────
// REGLA (Emiliano, 17 sep 2026): propios son estos dos client IDs; TODO otro
// client_id es un merchant de venta de terceros. Los canales se filtran por
// exclusión (NOT IN propios), así los merchants nuevos entran solos sin tocar
// ninguna lista.

export const CLIENT_IDS_PROPIOS = ['2026134', '2461631']

// Filtro de clientes para queries de finanzas: lista explícita (IN) o
// exclusión (NOT IN). { notIn: [] } = todos, sin filtro.
export type FiltroClientes = string[] | { notIn: string[] }

export const CLIENTES_TERCEROS: FiltroClientes = { notIn: CLIENT_IDS_PROPIOS }
export const CLIENTES_TODOS: FiltroClientes = { notIn: [] }

/**
 * Condición SQL para queries que interpolan (réplica GOcelular). Whitelist
 * /^\d+$/ sobre cada id. Devuelve null si una lista quedó vacía tras sanear
 * (el caller debe devolver vacío); { notIn: [] } devuelve 'TRUE' (sin filtro).
 */
export function sqlCondicionClientes(filtro: FiltroClientes, col: string): string | null {
  const sanear = (ids: string[]) => ids.filter(id => /^\d+$/.test(id))
  if (Array.isArray(filtro)) {
    const seguros = sanear(filtro)
    if (seguros.length === 0) return null
    return `${col} IN (${seguros.map(id => `'${id}'`).join(', ')})`
  }
  const seguros = sanear(filtro.notIn)
  if (seguros.length === 0) return 'TRUE'
  return `${col} NOT IN (${seguros.map(id => `'${id}'`).join(', ')})`
}

/**
 * Variante parametrizada ($n) para la base directa de GOcuotas (client_id
 * numérico). Devuelve la cláusula "AND ..." (o '' si no hay filtro) y los
 * values a pasar a la query; null si una lista quedó sin ids válidos.
 */
export function condicionClientesNum(
  filtro: FiltroClientes,
  col: string,
  startIdx = 1,
): { clause: string; values: number[] } | null {
  const aNums = (ids: string[]) => ids.filter(id => /^\d+$/.test(id)).map(Number)
  const placeholders = (n: number) => Array.from({ length: n }, (_, i) => `$${startIdx + i}`).join(',')
  if (Array.isArray(filtro)) {
    const values = aNums(filtro)
    if (values.length === 0) return null
    return { clause: `AND ${col} IN (${placeholders(values.length)})`, values }
  }
  const values = aNums(filtro.notIn)
  if (values.length === 0) return { clause: '', values: [] }
  return { clause: `AND ${col} NOT IN (${placeholders(values.length)})`, values }
}

// ─── Legacy (listas hardcodeadas) ─────────────────────────────────────────
// Quedan solo para consumidores que necesitan una lista explícita (p.ej. el
// tab Resultado de terceros con su config por merchant). NO usar para filtrar
// canales — usar CLIENTES_TERCEROS / CLIENTES_TODOS.

export const CLIENT_IDS_TERCEROS = ['1', '5495277', '6033574', '6115009', '6284199', '6277174']

// Todos los client IDs (propios + terceros) — para queries que necesitan el universo completo
export const CLIENT_IDS_TODOS = [...CLIENT_IDS_PROPIOS, ...CLIENT_IDS_TERCEROS]

// Helper para usar en queries SQL con IN (...)
export const SQL_IDS_TODOS = CLIENT_IDS_TODOS.map(id => `'${id}'`).join(', ')
export const SQL_IDS_PROPIOS = CLIENT_IDS_PROPIOS.map(id => `'${id}'`).join(', ')
export const SQL_IDS_TERCEROS = CLIENT_IDS_TERCEROS.map(id => `'${id}'`).join(', ')

// Client IDs terceros como números (para query a GOcuotas directa)
export const CLIENT_IDS_TERCEROS_NUM = CLIENT_IDS_TERCEROS.map(Number).filter(n => n > 1)
