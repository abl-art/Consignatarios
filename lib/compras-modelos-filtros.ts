// Preselección de filtros de /compras/modelos al llegar con ?producto=<id>
// (el link "sin costo →" de la lista de precios GOmarket): sin esto, la
// página arranca filtrada en Celulares y el producto linkeado queda invisible.

// Marcas de celulares reconocidas (la marca de un celular se deduce del nombre
// del producto). Si cambia, mantener en sync con ModelosClient.
export const MARCAS_CELULARES = ['Motorola', 'Samsung', 'Nubia', 'Xiaomi', 'Honor'] as const

/** Marca inferida de un producto. Solo Celulares tiene marca estructurada
 * (sale del nombre); otras categorías → null (no se puede filtrar por marca). */
export function marcaDeProducto(prod: { nombre: string; categoria: string }): string | null {
  if (prod.categoria !== 'Celulares') return null
  const n = prod.nombre.toLowerCase()
  return MARCAS_CELULARES.find((m) => n.includes(m.toLowerCase())) ?? null
}

export function marcasDeProveedor(notas: string): string[] {
  try {
    return JSON.parse(notas)?.marcas || []
  } catch {
    return []
  }
}

/** ¿El proveedor vende este producto? Criterio = marca (decisión 17/11):
 * proveedor sin marcas configuradas vende todo; producto sin marca inferible
 * (no-celular) se muestra igual (no hay con qué filtrar). */
export function proveedorVendeProducto(
  proveedorNotas: string,
  prod: { nombre: string; categoria: string },
): boolean {
  const marcasProv = marcasDeProveedor(proveedorNotas)
  if (marcasProv.length === 0) return true
  const marca = marcaDeProducto(prod)
  if (!marca) return true
  return marcasProv.includes(marca)
}

export function filtrosInicialesModelos(
  productoId: string | null,
  productos: { id: string; categoria: string | null; plataforma?: string }[],
): { categoria: string; tienda: 'gocelular' | 'gomarket' } | null {
  if (!productoId) return null
  const p = productos.find(x => x.id === productoId)
  if (!p) return null
  return {
    categoria: p.categoria ?? '',
    tienda: p.plataforma === 'gomarket' ? 'gomarket' : 'gocelular',
  }
}
