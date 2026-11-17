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

/** Tipos de producto que vende el proveedor (columna direccion = JSON array). */
export function tiposDeProveedor(direccion: string): string[] {
  try {
    const v = JSON.parse(direccion)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Una categoría de producto matchea el tipo del proveedor si uno contiene al
// otro (tolera "Tablets" ↔ "Tablets y Computadoras", etc.).
function categoriaEnTipos(tipos: string[], categoria: string): boolean {
  if (tipos.length === 0) return true // proveedor sin tipos cargados = cualquier categoría
  const c = categoria.toLowerCase()
  return tipos.some((t) => {
    const tl = t.toLowerCase()
    return tl.includes(c) || c.includes(tl)
  })
}

/** ¿El proveedor vende este producto? Dos filtros (decisión 17/11, refinada):
 * 1) CATEGORÍA: el proveedor debe vender la categoría del producto (su
 *    tipo_producto) — así un proveedor de electro/parlantes/kits NO aparece en
 *    Celulares aunque no tenga marcas cargadas.
 * 2) MARCA (solo celulares con marca inferible): si tiene marcas configuradas,
 *    debe incluir la del producto. Sin marcas cargadas = no filtra por marca. */
export function proveedorVendeProducto(
  prov: { direccion: string; notas: string },
  prod: { nombre: string; categoria: string },
): boolean {
  if (!categoriaEnTipos(tiposDeProveedor(prov.direccion), prod.categoria)) return false
  const marca = marcaDeProducto(prod)
  if (marca) {
    const marcasProv = marcasDeProveedor(prov.notas)
    if (marcasProv.length > 0 && !marcasProv.includes(marca)) return false
  }
  return true
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
