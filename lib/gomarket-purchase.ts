// Compras de GOmarket: armado y validación del payload para el webhook
// Commerce v1 de GOcelular (novedad de Pedro 22 sep 2026, ref
// /api/webhooks/commerce/v1/purchases). A diferencia de las compras de
// GOcelular, van SIN IMEIs: una línea por SKU con quantity y unit_cost
// opcional (pesos como string). Los SKUs deben existir antes en commerce_skus.

export type Plataforma = 'gocelular' | 'gomarket'

export interface CommercePurchaseLine {
  sku: string
  quantity: number
  unit_cost?: string
}

export interface ItemCompraGomarket {
  productoCodigo: string
  productoNombre: string
  cantidad: number
  precio: number
}

/**
 * Plataforma de un pedido según sus productos. Un producto sin plataforma
 * conocida cuenta como 'gocelular' (default histórico). Mezcla → 'mixto':
 * el pedido no se puede informar a un solo endpoint.
 */
export function plataformaDePedido(
  productoIds: string[],
  plataformaPorProducto: Map<string, string>,
): Plataforma | 'mixto' {
  let hayGocelular = false
  let hayGomarket = false
  for (const id of productoIds) {
    if ((plataformaPorProducto.get(id) ?? 'gocelular') === 'gomarket') hayGomarket = true
    else hayGocelular = true
  }
  if (hayGomarket && hayGocelular) return 'mixto'
  return hayGomarket ? 'gomarket' : 'gocelular'
}

/**
 * Líneas del webhook Commerce a partir de los items del pedido. El contrato
 * pide una línea por SKU: items repetidos del mismo SKU se consolidan sumando
 * cantidades (el costo queda el del primero con costo válido). Sin código de
 * producto o con cantidad inválida → error (el SKU es la identidad del
 * artículo en commerce_skus y en Andreani).
 */
export function armarLineasGomarket(items: ItemCompraGomarket[]): { lines: CommercePurchaseLine[]; errores: string[] } {
  const errores: string[] = []
  const porSku = new Map<string, CommercePurchaseLine>()

  for (const item of items) {
    const sku = item.productoCodigo?.trim()
    if (!sku) {
      errores.push(`"${item.productoNombre}" no tiene código de producto — cargale el SKU de GOmarket en Compras → Modelos`)
      continue
    }
    if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      errores.push(`"${item.productoNombre}" tiene cantidad inválida (${item.cantidad})`)
      continue
    }
    const costoValido = typeof item.precio === 'number' && Number.isFinite(item.precio) && item.precio > 0
    const existente = porSku.get(sku)
    if (existente) {
      existente.quantity += item.cantidad
      if (!existente.unit_cost && costoValido) existente.unit_cost = item.precio.toFixed(2)
    } else {
      porSku.set(sku, {
        sku,
        quantity: item.cantidad,
        ...(costoValido ? { unit_cost: item.precio.toFixed(2) } : {}),
      })
    }
  }

  return { lines: [...porSku.values()], errores }
}

export interface SkuCommerce {
  sku: string
  activo: boolean
  serialPolicy: string | null
}

/**
 * Pre-validación contra el catálogo commerce_skus de GOcelular (los SKUs
 * existen ANTES de la compra; uno desconocido rebota con 400 unknown_sku).
 * serial_policy 'required' es warning: la primera carga supervisada a Andreani
 * no admite SKUs con serial obligatorio (aviso de Pedro 22/9).
 */
export function validarSkusCommerce(
  lines: CommercePurchaseLine[],
  catalogo: Map<string, SkuCommerce>,
): { errores: string[]; warnings: string[] } {
  const errores: string[] = []
  const warnings: string[] = []
  for (const l of lines) {
    const cat = catalogo.get(l.sku)
    if (!cat) {
      errores.push(`SKU ${l.sku} no existe en el catálogo de GOmarket (commerce_skus) — hay que darlo de alta en el admin de GOmarket antes de informar la compra`)
    } else if (!cat.activo) {
      errores.push(`SKU ${l.sku} existe pero está inactivo en el catálogo de GOmarket`)
    } else if (cat.serialPolicy === 'required') {
      warnings.push(`SKU ${l.sku} tiene serial obligatorio (serial_policy required) — la primera carga a Andreani no lo admite, coordinar con GOcelular`)
    }
  }
  return { errores, warnings }
}
