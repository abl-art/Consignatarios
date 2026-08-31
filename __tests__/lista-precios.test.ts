import { describe, it, expect } from 'vitest'
import {
  armarListaPrecios,
  armarHistorialBonos,
  aplicarTodoBono,
  elegirCosto,
  recortarVentasACupo,
  type BonoRegistro,
  type ProductoLista,
  type TodoNotas,
  type VentaPropiaDiaria,
} from '@/lib/lista-precios'

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

  describe('cupo del bono', () => {
    const COSTOS = { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }
    const HOY_CUPO = new Date('2026-08-25')
    const bonoCupo = { monto: 50000, desde: '2026-08-01', hasta: '2026-09-15', cupo: 10 }
    const ventasPropias = (n: number, fecha = '2026-08-10', modelo = 'Motorola Moto G17 4/128GB'): VentaPropiaDiaria[] =>
      [{ fecha, modelo, ventas: n }]

    it('bono con cupo no alcanzado sigue vigente y expone el progreso', () => {
      const [fila] = armarListaPrecios(
        [producto()], COSTOS, {}, {}, VENTAS,
        { p1: bonoCupo }, HOY_CUPO, ventasPropias(4),
      )
      expect(fila.bonoMonto).toBe(50000)
      expect(fila.pvpConBono).toBe(434700)
      expect(fila.bonoCupo).toBe(10)
      expect(fila.bonoVendidas).toBe(4)
      expect(fila.bonoEstado).toBe('vigente')
    })

    it('expone el desde del bono vigente para poder editarlo', () => {
      const [fila] = armarListaPrecios(
        [producto()], COSTOS, {}, {}, VENTAS,
        { p1: bonoCupo }, HOY_CUPO, ventasPropias(4),
      )
      expect(fila.bonoDesde).toBe('2026-08-01')
      const [sinDesde] = armarListaPrecios(
        [producto()], COSTOS, {}, {}, VENTAS,
        { p1: { monto: 50000, hasta: '2026-09-15' } }, HOY_CUPO, [],
      )
      expect(sinDesde.bonoDesde).toBeNull()
    })

    it('cupo alcanzado corta el descuento igual que vencido, con estado agotado visible', () => {
      const [fila] = armarListaPrecios(
        [producto()], COSTOS, {}, {}, VENTAS,
        { p1: bonoCupo }, HOY_CUPO, ventasPropias(10),
      )
      expect(fila.bonoMonto).toBeNull()
      expect(fila.pvpConBono).toBeNull()
      expect(fila.cuotaConBono).toBeNull()
      expect(fila.ncEsperada).toBeNull()
      expect(fila.bonoEstado).toBe('agotado')
      expect(fila.bonoCupo).toBe(10)
      expect(fila.bonoVendidas).toBe(10)
      // la diferencia vuelve a compararse contra el PVP pleno
      const [conTienda] = armarListaPrecios(
        [producto()], COSTOS, {}, { 'Motorola Moto G17 4/128GB': 434700 }, VENTAS,
        { p1: bonoCupo }, HOY_CUPO, ventasPropias(10),
      )
      expect(conTienda.diferencia).toBe(434700 - 484200)
    })

    it('solo cuentan las ventas dentro de la vigencia del bono', () => {
      const ventas: VentaPropiaDiaria[] = [
        { fecha: '2026-07-31', modelo: 'Motorola Moto G17 4/128GB', ventas: 8 }, // antes de desde
        { fecha: '2026-08-10', modelo: 'Motorola Moto G17 4/128GB', ventas: 3 },
        { fecha: '2026-09-15', modelo: 'Motorola Moto G17 4/128GB', ventas: 2 }, // hasta inclusive
        { fecha: '2026-09-16', modelo: 'Motorola Moto G17 4/128GB', ventas: 9 }, // después de hasta
      ]
      const [fila] = armarListaPrecios(
        [producto()], COSTOS, {}, {}, VENTAS,
        { p1: bonoCupo }, HOY_CUPO, ventas,
      )
      expect(fila.bonoVendidas).toBe(5)
      expect(fila.bonoEstado).toBe('vigente')
    })

    it('matchea el modelo con nombre normalizado y no cuenta otros modelos', () => {
      const ventas: VentaPropiaDiaria[] = [
        { fecha: '2026-08-10', modelo: 'Celular Motorola Moto G17 4/128 GB', ventas: 6 },
        { fecha: '2026-08-10', modelo: 'Motorola Moto G67 4/256GB', ventas: 7 },
      ]
      const [fila] = armarListaPrecios(
        [producto()], COSTOS, {}, {}, VENTAS,
        { p1: bonoCupo }, HOY_CUPO, ventas,
      )
      expect(fila.bonoVendidas).toBe(6)
    })

    it('un bono sin cupo funciona como siempre y no expone progreso', () => {
      const [fila] = armarListaPrecios(
        [producto()], COSTOS, {}, {}, VENTAS,
        { p1: { monto: 50000, hasta: '2026-09-15' } }, HOY_CUPO, ventasPropias(99),
      )
      expect(fila.bonoMonto).toBe(50000)
      expect(fila.bonoEstado).toBe('vigente')
      expect(fila.bonoCupo).toBeNull()
      expect(fila.bonoVendidas).toBeNull()
    })
  })

  describe('modelos fijados manualmente (desplegable Agregar modelo)', () => {
    const COSTOS_FIJADO = { p1: [{ proveedor: 'NEWSAN SA', precio: 242000 }] }

    it('un modelo sin ventas pero fijado aparece en la lista con fijado=true', () => {
      const filas = armarListaPrecios(
        [producto()], COSTOS_FIJADO, {}, {}, {}, // sin ventas
        {}, new Date('2026-08-25'), [], ['p1'],
      )
      expect(filas).toHaveLength(1)
      expect(filas[0].ventas30d).toBe(0)
      expect(filas[0].fijado).toBe(true)
      expect(filas[0].pvp).toBe(484200) // calcula precios como cualquier fila
    })

    it('un modelo con ventas y no fijado sale con fijado=false; fijado con ventas mantiene fijado=true', () => {
      const filas = armarListaPrecios(
        [producto(), producto({ id: 'p2', nombre: 'Motorola Moto G67 4/256GB' })],
        COSTOS_FIJADO, {}, {}, { ...VENTAS, 'Motorola Moto G67 4/256GB': 5 },
        {}, new Date('2026-08-25'), [], ['p2'],
      )
      expect(filas.find(f => f.productoId === 'p1')?.fijado).toBe(false)
      expect(filas.find(f => f.productoId === 'p2')?.fijado).toBe(true)
    })

    it('sin ventas y sin fijar sigue sin aparecer', () => {
      const filas = armarListaPrecios([producto()], COSTOS_FIJADO, {}, {}, {})
      expect(filas).toHaveLength(0)
    })
  })

  describe('armarHistorialBonos (pestaña Bonos)', () => {
    const HOY_HIST = new Date('2026-08-25')
    const registro = (over: Partial<BonoRegistro> = {}): BonoRegistro => ({
      id: 'b1',
      productoId: 'p1',
      nombreModelo: 'Motorola Moto G17 4/128GB',
      monto: 50000,
      desde: '2026-08-01',
      hasta: '2026-09-15',
      cupo: 10,
      pdfUrl: null,
      ...over,
    })

    it('calcula vendidas, unidades reconocidas y NC total con el múltiplo del producto', () => {
      const [fila] = armarHistorialBonos(
        [registro()],
        [{ fecha: '2026-08-10', modelo: 'Motorola Moto G17 4/128GB', ventas: 4 }],
        { p1: 2 },
        HOY_HIST,
      )
      expect(fila.estado).toBe('vigente')
      expect(fila.vendidas).toBe(4)
      expect(fila.reconocidas).toBe(4)
      expect(fila.ncUnitaria).toBe(25000)
      expect(fila.ncTotal).toBe(100000)
    })

    it('las reconocidas se cortan en el cupo aunque se haya vendido de más', () => {
      const [fila] = armarHistorialBonos(
        [registro()],
        [{ fecha: '2026-08-10', modelo: 'Motorola Moto G17 4/128GB', ventas: 14 }],
        { p1: 2 },
        HOY_HIST,
      )
      expect(fila.estado).toBe('agotado')
      expect(fila.vendidas).toBe(14)
      expect(fila.reconocidas).toBe(10)
      expect(fila.ncTotal).toBe(250000)
    })

    it('un bono vencido queda en el historial con su estado y sus números', () => {
      const [fila] = armarHistorialBonos(
        [registro({ hasta: '2026-08-20', cupo: undefined })],
        [{ fecha: '2026-08-10', modelo: 'Motorola Moto G17 4/128GB', ventas: 6 }],
        {},
        HOY_HIST,
      )
      expect(fila.estado).toBe('vencido')
      expect(fila.vendidas).toBe(6)
      expect(fila.reconocidas).toBe(6) // sin cupo se reconocen todas
      expect(fila.ncUnitaria).toBe(25000) // múltiplo default 2
    })

    it('ordena por creación más reciente primero (desde descendente)', () => {
      const filas = armarHistorialBonos(
        [registro({ id: 'viejo', desde: '2026-07-01', hasta: '2026-07-15' }), registro({ id: 'nuevo' })],
        [],
        {},
        HOY_HIST,
      )
      expect(filas.map(f => f.id)).toEqual(['nuevo', 'viejo'])
    })
  })

  describe('recortarVentasACupo (para el PDF de prueba de ventas)', () => {
    const venta = (fecha: string, imei: string) => ({ fecha, imei, modelo: 'Moto G17', factura: 'B-0001' })

    it('corta en las primeras cupo unidades ordenadas por fecha', () => {
      const ventas = [venta('2026-08-12', 'C'), venta('2026-08-10', 'A'), venta('2026-08-11', 'B')]
      const r = recortarVentasACupo(ventas, 2)
      expect(r.map(v => v.imei)).toEqual(['A', 'B'])
    })

    it('sin cupo devuelve todas ordenadas', () => {
      const ventas = [venta('2026-08-12', 'C'), venta('2026-08-10', 'A')]
      expect(recortarVentasACupo(ventas, undefined).map(v => v.imei)).toEqual(['A', 'C'])
    })
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
