import { describe, it, expect } from 'vitest'
import { armarListaGomarket } from '@/lib/lista-precios-gomarket'
import type { CostoProveedor } from '@/lib/lista-precios'

const prod = (over: Partial<{ id: string; nombre: string; categoria: string | null; codigo: string | null }> = {}) => ({
  id: 'p1',
  nombre: 'TV 32" Hisense HD A42K',
  categoria: 'TV, Sonido y Electronicos',
  codigo: '32A42K',
  ...over,
})

describe('armarListaGomarket', () => {
  it('calcula pvp con la cuota de 9 redondeada a 100', () => {
    const costos: Record<string, CostoProveedor[]> = { p1: [{ proveedor: 'Newsan', precio: 100000 }] }
    const [fila] = armarListaGomarket([prod()], costos, {}, 1.4, {})
    // 100000 × 1.4 = 140000 → /9 = 15555.5 → ceil a 100 = 15600 → ×9 = 140400
    expect(fila.cuota).toBe(15600)
    expect(fila.pvp).toBe(140400)
    expect(fila.costo).toEqual({ proveedor: 'Newsan', precio: 100000 })
    expect(fila.precioTienda).toBeNull()
    expect(fila.difPct).toBeNull()
  })

  it('sin costo: fila presente con costo y pvp null (nunca se omite)', () => {
    const [fila] = armarListaGomarket([prod()], {}, {}, 1.4, {})
    expect(fila.productoId).toBe('p1')
    expect(fila.costo).toBeNull()
    expect(fila.pvp).toBeNull()
    expect(fila.cuota).toBeNull()
  })

  it('elige el costo más barato entre proveedores', () => {
    const costos: Record<string, CostoProveedor[]> = {
      p1: [
        { proveedor: 'Caro SA', precio: 120000 },
        { proveedor: 'Barato SRL', precio: 99000 },
      ],
    }
    const [fila] = armarListaGomarket([prod()], costos, {}, 1.4, {})
    expect(fila.costo).toEqual({ proveedor: 'Barato SRL', precio: 99000 })
  })

  it('el múltiplo por producto pisa al default', () => {
    const costos: Record<string, CostoProveedor[]> = { p1: [{ proveedor: 'Newsan', precio: 100000 }] }
    const [fila] = armarListaGomarket([prod()], costos, { p1: 2 }, 1.4, {})
    expect(fila.multiplo).toBe(2)
    // 200000 / 9 = 22222.2 → 22300 → ×9 = 200700
    expect(fila.pvp).toBe(200700)
  })

  it('matchea precioTienda por codigo/SKU y calcula difPct con signo', () => {
    const costos: Record<string, CostoProveedor[]> = { p1: [{ proveedor: 'Newsan', precio: 100000 }] }
    const [fila] = armarListaGomarket([prod()], costos, {}, 1.4, { '32A42K': 150000 })
    expect(fila.precioTienda).toBe(150000)
    // (150000 - 140400) / 140400 × 100 = 6.837… → 6.84
    expect(fila.difPct).toBe(6.84)
  })

  it('sin codigo o sin listing → precioTienda y difPct null', () => {
    const costos: Record<string, CostoProveedor[]> = { p1: [{ proveedor: 'Newsan', precio: 100000 }], p2: [{ proveedor: 'Newsan', precio: 50000 }] }
    const filas = armarListaGomarket(
      [prod(), prod({ id: 'p2', nombre: 'Pava eléctrica', codigo: null, categoria: 'Pequeños Electrodomesticos' })],
      costos, {}, 1.4, { OTRO: 99 },
    )
    for (const f of filas) {
      expect(f.precioTienda).toBeNull()
      expect(f.difPct).toBeNull()
    }
  })

  it('ordena por categoría y nombre', () => {
    const filas = armarListaGomarket(
      [
        prod({ id: 'a', nombre: 'Zeta TV', categoria: 'TV, Sonido y Electronicos' }),
        prod({ id: 'b', nombre: 'Batidora', categoria: 'Pequeños Electrodomesticos' }),
        prod({ id: 'c', nombre: 'Alfa TV', categoria: 'TV, Sonido y Electronicos' }),
      ],
      {}, {}, 1.4, {},
    )
    expect(filas.map(f => f.productoId)).toEqual(['b', 'c', 'a'])
  })
})
