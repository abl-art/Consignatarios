// Catálogo de productos de GOmarket (commerce_products/commerce_skus de la
// réplica de GOcelular) → compras_productos del gestor. El alta de productos
// vive en el admin de GOmarket (no hay endpoint externo de alta, verificado
// 22 sep 2026: solo existe /commerce/v1/purchases); el gestor los sincroniza
// solo, igual que los Kits de Seguridad, para no cargar nada dos veces.

export interface SkuGomarket {
  sku: string
  nombre: string
  categoria: string | null
  activo: boolean
}

export interface ProductoGestorGomarket {
  id: string
  codigo: string
  nombre: string
  categoria: string
  oculto: boolean
}

export interface PlanSyncGomarket {
  nuevos: { codigo: string; nombre: string; categoria: string; plataforma: 'gomarket' }[]
  actualizar: { id: string; nombre: string; categoria: string; oculto: boolean }[]
  ocultar: string[] // ids
}

// Un SKU sin categoría cae en la genérica hasta que la tengan asignada en GOmarket
export const CATEGORIA_GOMARKET_DEFAULT = 'GOmarket'

/**
 * Diff entre el catálogo de GOmarket y los productos plataforma='gomarket' del
 * gestor: crea los nuevos SKUs activos, actualiza nombre/categoría (y reactiva
 * si el SKU volvió a estar activo), y oculta los que ya no existen o están
 * inactivos en GOmarket — incluye altas manuales cuyo SKU no exista allá:
 * una compra con ese SKU rebotaría con unknown_sku de todas formas.
 */
export function planSyncGomarket(catalogo: SkuGomarket[], existentes: ProductoGestorGomarket[]): PlanSyncGomarket {
  const porCodigo = new Map(existentes.map(p => [p.codigo, p]))
  const activos = new Map(catalogo.filter(s => s.activo).map(s => [s.sku, s]))

  const nuevos: PlanSyncGomarket['nuevos'] = []
  const actualizar: PlanSyncGomarket['actualizar'] = []

  for (const s of activos.values()) {
    const categoria = s.categoria ?? CATEGORIA_GOMARKET_DEFAULT
    const existente = porCodigo.get(s.sku)
    if (!existente) {
      nuevos.push({ codigo: s.sku, nombre: s.nombre, categoria, plataforma: 'gomarket' })
    } else if (existente.nombre !== s.nombre || existente.categoria !== categoria || existente.oculto) {
      actualizar.push({ id: existente.id, nombre: s.nombre, categoria, oculto: false })
    }
  }

  const ocultar = existentes
    .filter(p => !activos.has(p.codigo) && !p.oculto)
    .map(p => p.id)

  return { nuevos, actualizar, ocultar }
}

export function nombreSkuGomarket(productName: string, variantName: string | null): string {
  const variante = variantName?.trim()
  return variante && !productName.toLowerCase().includes(variante.toLowerCase())
    ? `${productName} ${variante}`
    : productName
}
