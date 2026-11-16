import { describe, it, expect } from 'vitest'
import { armarRankingProductos, type ProductoVenta30d } from '@/lib/productos-precio'

const p = (nombre: string, precioTienda: number | null, unidades: number, monto: number): ProductoVenta30d =>
  ({ nombre, precioTienda, unidades, monto })

describe('armarRankingProductos', () => {
  it('ordena de más barato a más caro aunque el ranking de ventas diga otra cosa', () => {
    const filas = armarRankingProductos([
      p('Caro y popular', 900000, 100, 90000000),
      p('Barato y poco vendido', 100000, 3, 300000),
      p('Medio', 500000, 50, 25000000),
    ])
    expect(filas.map(f => f.nombre)).toEqual(['Barato y poco vendido', 'Medio', 'Caro y popular'])
    expect(filas.map(f => f.rankingVentas)).toEqual([3, 2, 1])
  })

  it('sin precio de tienda usa el promedio de venta como precio (estimado)', () => {
    const filas = armarRankingProductos([
      p('Despublicado', null, 4, 800000), // promedio 200000
      p('Publicado', 300000, 10, 3000000),
    ])
    expect(filas[0]).toMatchObject({ nombre: 'Despublicado', precio: 200000, precioEstimado: true })
    expect(filas[1]).toMatchObject({ nombre: 'Publicado', precioEstimado: false })
  })

  it('empates en unidades comparten puesto de ranking', () => {
    const filas = armarRankingProductos([
      p('A', 100, 10, 1000),
      p('B', 200, 10, 2000),
      p('C', 300, 5, 1500),
    ])
    const porNombre = Object.fromEntries(filas.map(f => [f.nombre, f.rankingVentas]))
    expect(porNombre).toEqual({ A: 1, B: 1, C: 3 })
  })

  it('descarta productos sin unidades vendidas', () => {
    const filas = armarRankingProductos([p('Sin ventas', 100, 0, 0), p('Vendido', 200, 1, 200)])
    expect(filas).toHaveLength(1)
    expect(filas[0].nombre).toBe('Vendido')
  })

  it('a igual precio gana el mejor ranking de ventas', () => {
    const filas = armarRankingProductos([
      p('Mismo precio, menos vendido', 100, 2, 200),
      p('Mismo precio, más vendido', 100, 9, 900),
    ])
    expect(filas[0].nombre).toBe('Mismo precio, más vendido')
  })
})
