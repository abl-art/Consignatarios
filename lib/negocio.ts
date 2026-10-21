// Unidad de negocio de cada producto: GOcelular (default histórico) o
// GOmarket. La fuente de verdad es compras_productos.plataforma — el flag que
// se elige al cargar el pedido en el gestor. Todo lo que no tiene flag es
// GOcelular; el cruce con el catálogo de GOcelular va por SKU y, de respaldo,
// por nombre normalizado (los display_name de la tienda difieren del nombre
// del gestor: "JBLGO5" vs "JBL Go 5").

export type Negocio = 'gocelular' | 'gomarket'
export type FiltroNegocio = Negocio | 'todos'

export interface NegocioMap {
  skusGomarket: Set<string>
  nombresGomarket: Set<string>
}

/**
 * Claves de nombre: minúsculas, sin capacidad, solo alfanuméricos — en DOS
 * variantes (con y sin prefijo de categoría), porque "Parlante" puede ser
 * prefijo agregado por GOcelular o parte real del nombre ("Parlante Xiaomi 2").
 */
function clavesNombre(nombre: string): string[] {
  const base = nombre
    .toLowerCase()
    .replace(/\b\d+\s*[/+]\s*\d+\s*gb?\b/g, '')
    .replace(/\b\d+\s*gb\b/g, '')
  const sinPrefijo = base.replace(/^\s*(celular(es)?|auricular(es)?|parlantes?|smart\s?watch(es)?|tablets?)\s+/, '')
  const limpiar = (s: string) => s.replace(/[^a-z0-9]/g, '')
  const c1 = limpiar(base)
  const c2 = limpiar(sinPrefijo)
  return c1 === c2 ? [c1] : [c1, c2]
}

export function armarNegocioMap(
  productos: { codigo: string | null; nombre: string; plataforma: string }[],
): NegocioMap {
  const skusGomarket = new Set<string>()
  const nombresGomarket = new Set<string>()
  for (const p of productos) {
    if (p.plataforma !== 'gomarket') continue
    if (p.codigo?.trim()) skusGomarket.add(p.codigo.trim().toLowerCase())
    for (const clave of clavesNombre(p.nombre)) if (clave) nombresGomarket.add(clave)
  }
  return { skusGomarket, nombresGomarket }
}

export function negocioDe(sku: string | null, nombre: string, mapa: NegocioMap): Negocio {
  if (sku && mapa.skusGomarket.has(sku.trim().toLowerCase())) return 'gomarket'
  if (clavesNombre(nombre).some((c) => c && mapa.nombresGomarket.has(c))) return 'gomarket'
  return 'gocelular'
}

export function filtrarStockPorNegocio<T extends { sku: string | null; nombre: string }>(
  rows: T[],
  filtro: FiltroNegocio,
  mapa: NegocioMap,
): T[] {
  if (filtro === 'todos') return rows
  return rows.filter((r) => negocioDe(r.sku, r.nombre, mapa) === filtro)
}

interface FilaConModelos {
  vel7: number | null
  vel30: number | null
  cobertura: number | null
  rotacion: number | null
  modelos: { modelo: string; stock: number; ventaDiaria30: number; cobertura: number | null; pctVentas30: number | null }[]
}

/**
 * Filtra el desglose por modelo según negocio y recalcula los agregados de la
 * fila con lo que queda: vel30 = suma de venta diaria, cobertura = stock/vel30.
 * vel7 y rotación no existen a nivel modelo → null (la UI muestra —).
 */
export function filtrarIndicadoresPorNegocio<T extends FilaConModelos>(
  filas: T[],
  filtro: FiltroNegocio,
  mapa: NegocioMap,
): T[] {
  if (filtro === 'todos') return filas
  const resultado: T[] = []
  for (const fila of filas) {
    const modelos = fila.modelos.filter((m) => negocioDe(null, m.modelo, mapa) === filtro)
    if (modelos.length === 0) continue
    const stock = modelos.reduce((s, m) => s + m.stock, 0)
    const vel30 = modelos.reduce((s, m) => s + m.ventaDiaria30, 0)
    resultado.push({
      ...fila,
      modelos,
      vel7: null,
      vel30,
      cobertura: vel30 > 0 ? stock / vel30 : null,
      rotacion: null,
    })
  }
  return resultado
}
