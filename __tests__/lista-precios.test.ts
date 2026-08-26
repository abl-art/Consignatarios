import { describe, it, expect } from 'vitest'
import { armarListaPrecios, aplicarTodoBono, elegirCosto, type ProductoLista, type TodoNotas } from '@/lib/lista-precios'

function producto(over: Partial<ProductoLista> = {}): ProductoLista {
  return { id: 'p1', nombre: 'Motorola Moto G17 4/128GB', codigo: 'MOTO-G17-128', ...over }
}

const VENTAS = { 'Motorola Moto G17 4/128GB': 50 }

describe('elegirCosto (compartida con la valorización de inventario)', () => {
  it('prefiere el proveedor de la marca aunque no sea el más barato', () => {
    const r = elegirCosto('Motorola', [
      { proveedor: 'SYNA SA', precio: 230000 },
      { proveedor: 'NEWSAN SA', precio: 242000 },
    ])
    expect(r).toEqual({ costo: { proveedor: 'NEWSAN SA', precio: 242000 }, preferido: true })
  })

  it('sin proveedor preferido con precio cae al más barato', () => {
    const r = elegirCosto('Samsung', [
      { proveedor: 'SYNA SA', precio: 700000 },
      { proveedor: 'MULTIPOINT SA', precio: 690000 },
    ])
    expect(r?.costo.precio).toBe(690000)
    expect(r?.preferido).toBe(false)
  })

  it('marca sin regla (accesorios) usa el más barato', () => {
    const r = elegirCosto('JBL', [
      { proveedor: 'OHPIC SA', precio: 50000 },
      { proveedor: 'SYNA SA', precio: 48000 },
    ])
    expect(r?.costo.precio).toBe(48000)
  })

  it('sin precios devuelve null', () => {
    expect(elegirCosto('Motorola', [])).toBeNull()
  })
})

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

  it('un bono vigente descuenta al PVP y re-redondea la cuota para arriba', () => {
    // PVP base 484.200 − bono 50.000 = 434.200 → cuota 48.300 → PVP con bono 434.700
    const [fila] = armarListaPrecios(
      [producto()], { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }, {}, {}, VENTAS,
      { p1: { monto: 50000, hasta: '2026-09-15' } }, new Date('2026-08-25'),
    )
    expect(fila.bonoMonto).toBe(50000)
    expect(fila.cuotaConBono).toBe(48300)
    expect(fila.pvpConBono).toBe(434700)
    expect(fila.pvpConBono! % 900).toBe(0)
  })

  it('la NC esperada es el bono dividido el múltiplo (neto de IVA y MUP)', () => {
    const [fila] = armarListaPrecios(
      [producto()], { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }, {}, {}, VENTAS,
      { p1: { monto: 50000 } }, new Date('2026-08-25'),
    )
    expect(fila.ncEsperada).toBe(25000)
  })

  it('un bono vencido o futuro no aplica', () => {
    const vencido = armarListaPrecios(
      [producto()], { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }, {}, {}, VENTAS,
      { p1: { monto: 50000, hasta: '2026-08-20' } }, new Date('2026-08-25'),
    )[0]
    expect(vencido.bonoMonto).toBeNull()
    expect(vencido.pvpConBono).toBeNull()
    const futuro = armarListaPrecios(
      [producto()], { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }, {}, {}, VENTAS,
      { p1: { monto: 50000, desde: '2026-09-01' } }, new Date('2026-08-25'),
    )[0]
    expect(futuro.bonoMonto).toBeNull()
  })

  it('con bono vigente la diferencia vs tienda compara contra el PVP con bono', () => {
    const [fila] = armarListaPrecios(
      [producto()], { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }, {},
      { 'Motorola Moto G17 4/128GB': 484200 }, VENTAS,
      { p1: { monto: 50000 } }, new Date('2026-08-25'),
    )
    expect(fila.diferencia).toBe(484200 - 434700)
  })

  const HOY = new Date('2026-08-26T12:00:00Z')

  it('un bono con vencimiento crea el ToDo "Vto BONO" urgente con id propio del bono', () => {
    const todos = aplicarTodoBono({}, 'p1', 'Motorola Moto G17 4/128GB', '2026-09-15', undefined, HOY)
    expect(todos['2026-09-15']).toEqual([
      { id: 'bono-p1-2026-09-15', text: 'Vto BONO Motorola Moto G17 4/128GB', done: false, prioridad: 'urgente' },
    ])
  })

  it('crea la NC 40 días después con el monto, corrida al lunes si cae en finde', () => {
    const todos = aplicarTodoBono({}, 'p1', 'Nubia Music 2 128/4GB', '2026-08-31', 60000, HOY)
    // 31/8 + 40 = sábado 10/10 → lunes 12/10; el texto conserva el vto real
    expect(todos['2026-10-10']).toBeUndefined()
    expect(todos['2026-10-12']).toEqual([
      { id: 'bono-nc-p1-2026-08-31', text: 'NC bono del 31/8 ($60.000) — Nubia Music 2 128/4GB', done: false, prioridad: 'urgente' },
    ])
  })

  it('un vencimiento en fin de semana corre el ToDo al lunes', () => {
    // 19/9/2026 es sábado
    const todos = aplicarTodoBono({}, 'p1', 'Moto G17', '2026-09-19', undefined, HOY)
    expect(todos['2026-09-19']).toBeUndefined()
    expect(todos['2026-09-21']).toHaveLength(1)
  })

  it('editar un bono vigente muda sus ToDos pendientes (mismo bono, fecha corregida)', () => {
    const previo: Record<string, TodoNotas[]> = {
      '2026-09-15': [
        { id: 'bono-p1-2026-09-15', text: 'Vto BONO Moto G17', done: false, prioridad: 'urgente' },
        { id: 'otro', text: 'llamar a Pedro', done: false },
      ],
      '2026-10-26': [{ id: 'bono-nc-p1-2026-09-15', text: 'NC bono del 15/9 — Moto G17', done: false }],
    }
    const todos = aplicarTodoBono(previo, 'p1', 'Moto G17', '2026-09-30', undefined, HOY)
    expect(todos['2026-09-15']).toEqual([{ id: 'otro', text: 'llamar a Pedro', done: false }])
    expect(todos['2026-10-26']).toEqual([])
    expect(todos['2026-09-30']).toHaveLength(1)
    // 30/9 + 40 = 9/11 (lunes)
    expect(todos['2026-11-09'][0].id).toBe('bono-nc-p1-2026-09-30')
  })

  it('los ToDos de un bono ya vencido quedan fijos: un bono nuevo no los pisa', () => {
    // bono viejo venció el 20/8 (antes de HOY): su NC del 29/9 es historia congelada
    const previo: Record<string, TodoNotas[]> = {
      '2026-08-20': [{ id: 'bono-p1-2026-08-20', text: 'Vto BONO Moto G17', done: true }],
      '2026-09-29': [{ id: 'bono-nc-p1-2026-08-20', text: 'NC bono del 20/8 ($50.000) — Moto G17', done: false }],
    }
    const todos = aplicarTodoBono(previo, 'p1', 'Moto G17', '2026-09-15', 80000, HOY)
    // el par viejo intacto + el par nuevo creado aparte
    expect(todos['2026-09-29']).toHaveLength(1)
    expect(todos['2026-09-29'][0].text).toContain('$50.000')
    expect(todos['2026-09-15'][0].id).toBe('bono-p1-2026-09-15')
  })

  it('quitar el bono borra solo los pendientes vigentes; vencidos y hechos quedan', () => {
    const previo: Record<string, TodoNotas[]> = {
      '2026-09-29': [{ id: 'bono-nc-p1-2026-08-20', text: 'NC bono del 20/8 — Moto G17', done: false }], // de bono vencido: fijo
      '2026-09-15': [{ id: 'bono-p1-2026-09-15', text: 'Vto BONO Moto G17', done: false }],
      '2026-10-26': [{ id: 'bono-nc-p1-2026-09-15', text: 'NC bono del 15/9 — Moto G17', done: false }],
    }
    const todos = aplicarTodoBono(previo, 'p1', 'Moto G17', undefined, undefined, HOY)
    expect(todos['2026-09-15']).toEqual([])
    expect(todos['2026-10-26']).toEqual([])
    expect(todos['2026-09-29']).toHaveLength(1)
  })

  it('re-guardar el bono no resetea ToDos ya hechos y migra los ids viejos sin fecha', () => {
    const previo: Record<string, TodoNotas[]> = {
      '2026-09-15': [{ id: 'bono-p1-2026-09-15', text: 'Vto BONO Moto G17', done: true, prioridad: 'urgente' }],
      '2026-10-26': [{ id: 'bono-nc-p1', text: 'NC bono legacy', done: false }], // formato viejo sin fecha
    }
    const todos = aplicarTodoBono(previo, 'p1', 'Moto G17', '2026-09-15', undefined, HOY)
    expect(todos['2026-09-15'].filter(t => t.id === 'bono-p1-2026-09-15')).toHaveLength(1)
    expect(todos['2026-09-15'][0].done).toBe(true)
    // el legacy pendiente se migra; la NC nueva cae 15/9+40 = 25/10 domingo → lunes 26/10
    expect(todos['2026-10-26'].map(t => t.id)).toEqual(['bono-nc-p1-2026-09-15'])
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
