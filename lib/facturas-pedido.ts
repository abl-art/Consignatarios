// ─── Facturas múltiples por pedido del gestor ──────────────────────────────
// Un pedido puede tener varias facturas del proveedor (pedido de Emiliano
// 20/11: al menos 4). Los archivos viven en el bucket privado
// 'facturas-pedidos'; acá solo la lógica pura sobre las referencias.
// Retro-compat: los pedidos viejos tienen una sola factura en `factura`.

export interface FacturaPedido {
  path: string
  nombre: string
  subidaAt: string
}

export const MAX_FACTURAS_PEDIDO = 6

/** Lista unificada: el array nuevo gana; el campo legacy de una sola factura se adapta. */
export function listaFacturas(p: { factura?: FacturaPedido; facturas?: FacturaPedido[] }): FacturaPedido[] {
  if (p.facturas && p.facturas.length > 0) return p.facturas
  return p.factura ? [p.factura] : []
}

export function agregarFactura(
  lista: FacturaPedido[],
  nueva: FacturaPedido,
): { ok: FacturaPedido[] } | { error: string } {
  if (lista.length >= MAX_FACTURAS_PEDIDO) {
    return { error: `Máximo ${MAX_FACTURAS_PEDIDO} facturas por pedido` }
  }
  return { ok: [...lista, nueva] }
}

export function quitarFactura(lista: FacturaPedido[], path: string): FacturaPedido[] {
  return lista.filter(f => f.path !== path)
}
