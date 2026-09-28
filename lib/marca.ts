// Normaliza la marca para filtrar/mostrar: la DB de GOcelular mezcla
// casings ('XIAOMI' y 'Xiaomi'). Las siglas cortas (JBL) quedan como están.
export function normalizarMarca(marca: string | null): string | null {
  if (!marca) return null
  const limpia = marca.trim()
  if (limpia.length > 3 && limpia === limpia.toUpperCase()) {
    return limpia[0] + limpia.slice(1).toLowerCase()
  }
  return limpia
}

// Prefijos de categoría que la tienda antepone al nombre del producto:
// la marca real viene después ("Auriculares Redmi Buds 6" → Redmi)
const PREFIJOS_CATEGORIA = new Set(['celular', 'celulares', 'auricular', 'auriculares', 'parlante', 'parlantes', 'smartwatch', 'tablet', 'tablets'])

/** Marca de un modelo por su nombre: primera palabra, salteando el prefijo de categoría. */
export function marcaDeModelo(modelo: string): string {
  const palabras = modelo.trim().split(/\s+/).filter(Boolean)
  const idx = palabras[0] && PREFIJOS_CATEGORIA.has(palabras[0].toLowerCase()) ? 1 : 0
  return normalizarMarca(palabras[idx] ?? null) ?? 'Otros'
}
