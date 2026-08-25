import { describe, it, expect } from 'vitest'
import { armarListaPrecios, type ProductoLista } from '@/lib/lista-precios'

function producto(over: Partial<ProductoLista> = {}): ProductoLista {
  return { id: 'p1', nombre: 'Motorola Moto G17 4/128GB', codigo: 'MOTO-G17-128', ...over }
}

const VENTAS = { 'Motorola Moto G17 4/128GB': 50 }

describe('armarListaPrecios', () => {
  it('usa el proveedor preferido de la marca (Motorola → Newsan)', () => {
    const [fila] = armarListaPrecios(
      [producto()],
      { p1: [{ proveedor: 'SYNA SA', precio: 230000 }, { proveedor: 'NEWSAN SA', precio: 242000 }] },
      {}, {}, VENTAS,
    )
    expect(fila.proveedor).toBe('NEWSAN SA')
    expect(fila.costo).toBe(242000)
    expect(fila.proveedorPreferido).toBe(true)
  })

  it('sin precio en el preferido cae al más barato del resto', () => {
    const [fila] = armarListaPrecios(
      [producto({ nombre: 'Samsung Galaxy A37 5G 256GB' })],
      { p1: [{ proveedor: 'SYNA SA', precio: 700000 }, { proveedor: 'MULTIPOINT SA', precio: 690000 }] },
      {}, {}, { 'Samsung Galaxy A37 5G 256GB': 10 },
    )
    expect(fila.proveedor).toBe('MULTIPOINT SA')
    expect(fila.costo).toBe(690000)
    expect(fila.proveedorPreferido).toBe(false)
  })

  it('la cuota se redondea a la centena SIEMPRE para arriba y el PVP es cuota×9', () => {
    // 242.000 × 2 = 484.000 → /9 = 53.777,78 → cuota 53.800 → PVP 484.200
    const [fila] = armarListaPrecios(
      [producto()], { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }, {}, {}, VENTAS,
    )
    expect(fila.cuota).toBe(53800)
    expect(fila.pvp).toBe(484200)
    expect(fila.pvp! % 900).toBe(0)
  })

  it('calcula MUP y MUP $ sobre el PVP sin IVA', () => {
    const [fila] = armarListaPrecios(
      [producto()], { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }, {}, {}, VENTAS,
    )
    // 484.200/1,21 = 400.165,29 → margen sin IVA 158.165,29
    expect(fila.mupPesos).toBeCloseTo(158165.29, 0)
    expect(fila.mup).toBeCloseTo(1.6536, 3)
  })

  it('el múltiplo por defecto es 2 y es editable por modelo', () => {
    const filas = armarListaPrecios(
      [producto(), producto({ id: 'p2', nombre: 'Motorola Moto G67 4/256GB' })],
      { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }], p2: [{ proveedor: 'NEWSAN SA', precio: 400000 }] },
      { p2: 1.8 }, {}, { ...VENTAS, 'Motorola Moto G67 4/256GB': 5 },
    )
    expect(filas[0].multiplo).toBe(2)
    expect(filas[1].multiplo).toBe(1.8)
    expect(filas[1].pvp).toBe(Math.ceil((400000 * 1.8) / 900) * 900)
  })

  it('solo lista modelos con ventas en los últimos 30 días', () => {
    const filas = armarListaPrecios(
      [producto(), producto({ id: 'p2', nombre: 'Motorola Moto G86 5G 256GB/8GB' })],
      { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }], p2: [{ proveedor: 'NEWSAN SA', precio: 555600 }] },
      {}, {}, VENTAS, // el G86 no vendió
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].ventas30d).toBe(50)
  })

  it('matchea ventas y precio tienda con variantes de nombre (Celular / RAM)', () => {
    const [fila] = armarListaPrecios(
      [producto({ nombre: 'Samsung Galaxy A17 4/128GB' })],
      { p1: [{ proveedor: 'IATEC SAU (Mirgor sa)', precio: 287000 }] },
      {},
      { 'Celular Samsung Galaxy A17 4/128 GB': 571500 },
      { 'Celular Samsung Galaxy A17 4/128 GB': 30 },
    )
    expect(fila.ventas30d).toBe(30)
    expect(fila.precioTienda).toBe(571500)
    // diferencia = tienda − PVP: 574.000 crudo → cuota 63.800 → PVP 574.200 → dif −2.700
    expect(fila.pvp).toBe(574200)
    expect(fila.diferencia).toBe(571500 - 574200)
  })

  it('un modelo con ventas pero sin precio en ningún proveedor sale con costo null', () => {
    const [fila] = armarListaPrecios([producto()], {}, {}, {}, VENTAS)
    expect(fila.costo).toBeNull()
    expect(fila.pvp).toBeNull()
    expect(fila.cuota).toBeNull()
  })

  it('ordena por marca y nombre', () => {
    const filas = armarListaPrecios(
      [producto({ id: 'p2', nombre: 'Xiaomi Redmi 14C 128/4 GB' }), producto()],
      { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }], p2: [{ proveedor: 'SOLNIK SA', precio: 206611 }] },
      {}, {}, { ...VENTAS, 'Xiaomi Redmi 14C 128/4 GB': 20 },
    )
    expect(filas.map(f => f.marca)).toEqual(['Motorola', 'Xiaomi'])
  })
})
