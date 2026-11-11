// Preselección de filtros de /compras/modelos al llegar con ?producto=<id>
// (el link "sin costo →" de la lista de precios GOmarket): sin esto, la
// página arranca filtrada en Celulares y el producto linkeado queda invisible.

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
