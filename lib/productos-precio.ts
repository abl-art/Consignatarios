// Tarjeta "Productos por precio" del Dashboard 360 (pedido de Emiliano 16/11/2026):
// los productos vendidos en la tienda propia los últimos 30 días, ordenados de
// más barato a más caro, con su ranking de ventas (1 = el más vendido en
// unidades) y lo facturado por cada uno en esos 30 días.

export interface ProductoVenta30d {
  nombre: string
  /** Precio actual de la tienda en $ (null si el producto ya no está publicado) */
  precioTienda: number | null
  unidades: number
  /** Facturado en $ los últimos 30 días */
  monto: number
}

export interface FilaRankingProducto {
  nombre: string
  /** Precio usado para ordenar: el de la tienda, o el promedio de venta si no está publicado */
  precio: number
  precioEstimado: boolean
  unidades: number
  monto: number
  /** 1 = el más vendido en unidades (empates comparten puesto) */
  rankingVentas: number
}

export function armarRankingProductos(productos: ProductoVenta30d[]): FilaRankingProducto[] {
  const conPrecio = productos
    .filter(p => p.unidades > 0)
    .map(p => ({
      nombre: p.nombre,
      precio: p.precioTienda ?? (p.monto > 0 ? p.monto / p.unidades : 0),
      precioEstimado: p.precioTienda === null,
      unidades: p.unidades,
      monto: p.monto,
    }))

  // Ranking por unidades vendidas, empates comparten puesto (1224 en vez de 1234)
  const porVentas = [...conPrecio].sort((a, b) => b.unidades - a.unidades)
  const ranking = new Map<string, number>()
  porVentas.forEach((p, i) => {
    const anterior = porVentas[i - 1]
    const puesto = anterior && anterior.unidades === p.unidades ? ranking.get(anterior.nombre)! : i + 1
    ranking.set(p.nombre, puesto)
  })

  // Orden principal: precio ascendente (el más barato primero); a igual precio, el más vendido
  return conPrecio
    .map(p => ({ ...p, rankingVentas: ranking.get(p.nombre)! }))
    .sort((a, b) => a.precio - b.precio || a.rankingVentas - b.rankingVentas)
}
