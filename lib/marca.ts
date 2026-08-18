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
