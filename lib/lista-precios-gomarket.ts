// Lista de precios de la tienda GOmarket (lógica pura, testeada).
// A diferencia de GOcelular: sin gate de ventas (entran todos los productos
// gomarket), sin seguro ni bonos, sin proveedor preferido por marca (el costo
// elegido cae siempre al más barato). La fórmula del PVP es la misma regla
// de cuota de 9 redondeada a $100 — GOmarket también vende en cuotas.

import { elegirCosto, type CostoProveedor } from './lista-precios'

export interface FilaGomarket {
  productoId: string
  nombre: string
  categoria: string | null
  codigo: string | null
  costo: { proveedor: string; precio: number } | null
  multiplo: number
  pvp: number | null
  cuota: number | null
  /** PVP real publicado en GOmarket (commerce_listing_skus, por SKU = codigo). */
  precioTienda: number | null
  /** (precioTienda − pvp) / pvp × 100, redondeado a 2 decimales. */
  difPct: number | null
}

export function armarListaGomarket(
  productos: { id: string; nombre: string; categoria: string | null; codigo: string | null }[],
  costosPorProducto: Record<string, CostoProveedor[]>,
  multiplos: Record<string, number>,
  multiploDefault: number,
  preciosListingPorSku: Record<string, number>,
): FilaGomarket[] {
  const filas: FilaGomarket[] = productos.map(p => {
    // Marca '—': sin proveedor preferido por marca, elegirCosto cae al más barato
    const eleccion = elegirCosto('—', costosPorProducto[p.id] ?? [])
    const multiplo = multiplos[p.id] ?? multiploDefault

    let cuota: number | null = null
    let pvp: number | null = null
    if (eleccion) {
      cuota = Math.ceil((eleccion.costo.precio * multiplo) / 9 / 100) * 100
      pvp = cuota * 9
    }

    const precioTienda = (p.codigo ? preciosListingPorSku[p.codigo] : undefined) ?? null
    const difPct =
      precioTienda !== null && pvp !== null && pvp > 0
        ? Math.round(((precioTienda - pvp) / pvp) * 10000) / 100
        : null

    return {
      productoId: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      codigo: p.codigo,
      costo: eleccion ? { proveedor: eleccion.costo.proveedor, precio: eleccion.costo.precio } : null,
      multiplo,
      pvp,
      cuota,
      precioTienda,
      difPct,
    }
  })

  return filas.sort(
    (a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? '') || a.nombre.localeCompare(b.nombre),
  )
}
