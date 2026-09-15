import { describe, it, expect } from 'vitest'
import {
  parseFacturaWarehouse,
  conciliarOutWarehouse,
  desgloseWarehouse,
  serialAFecha,
  type Celda,
  type FacturaWarehouseParseada,
} from '@/lib/warehouse-factura'

// 46235 = 2026-08-01 (serial de Excel)
const AGO1 = 46235

const resumen: Celda[][] = [
  ['Patricio Campodonico'],
  ['Arranca en Agosto´26 (Cte 123734)'],
  ['GO CUOTAS ', 'Item Facturable', 'Detalle', 'MES/AÑO REAL', 'REAL', 'Q FACT.', '$ Unitario', '$ FACTURACION'],
  [null, 'IN BULTO', 'Bulto', AGO1, 426, 426, 1149.08, 489508.08],
  [null, 'ALMACEN ', 'BALDA 60x60x80', AGO1, 37, 37, 15072.51, 557682.87],
  [null, 'OUT UNIDAD', 'Unidad', AGO1, 3, 3, 2799.81, 8399.43],
  [null, 'INSUMOS', 'Bolsas E-Comm', AGO1, 2, 2, 229.5, 459],
  [null, 'SEGURO', 0.002, AGO1, 0, 377270236, 0.002, 754540.47],
  [null, null, null, null, null, null, 'TOTAL FC', 1810589.85],
]

const outHoja: Celda[][] = [
  [],
  ['Número de orden:', 'Artículo:', 'Propietario:', 'Orden externa Nº 1:', 'Nº de línea:', 'Paquete:', 'UDM:', 'Nº de línea externa:', 'Cantidad pendiente:', 'Cantidad de orden:', 'Cantidad asignada:', 'Cantidad preparada (para comprobación):', 'Ctd. expedida:', 'Estatus:', 'Cantidad preasignada:', 'Cantidad cumplimiento', 'Código de motivo:', 'Estimación de palets', 'Rotar por:', 'Cantidad ajustada', 'Estrategia de preasignación clásica:', 'Estrategia de asignación clásica:', 'Tipo de estrategia de asignación:', 'Estrategia de asignación:', 'Clasificación de ubicación de preparación dinámica:', 'Ubicación producción en zona espera:', 'Fecha de envío:'],
  ['0000065184', 'NM2L15GMW', 'GOCUOTAS', 'SO-AAA111', '00001', 'x', 'EA', 'WMS00001', 0, 1, 0, 0, 1, '95', '0', '0', '', '0', 'Lot', '0', 'E', 'E', '1', '', '1', '', AGO1 + 6],
  ['0000065185', 'KS-MOTO-G06', 'GOCUOTAS', 'SO-AAA111', '00002', 'x', 'EA', 'WMS00002', 0, 1, 0, 0, 1, '95', '0', '0', '', '0', 'Lot', '0', 'E', 'E', '1', '', '1', '', AGO1 + 6],
  ['0000065186', 'SM-A175FZKFLEA', 'GOCUOTAS', 'SO-BBB222', '00001', 'x', 'EA', 'WMS00001', 0, 1, 0, 0, 1, '95', '0', '0', '', '0', 'Lot', '0', 'E', 'E', '1', '', '1', '', AGO1 + 7],
  [null], // fila vacía al final
]

const inHoja: Celda[][] = [
  ['Planilla de Indicadores'],
  ['Mes:', null, 'Agosto', 'Año:', 2026],
  ['Llegada', null, null, null, null, null, 'Romaneo', null, null, null, 'Entrada', null, null, null, null, 'Doble Control', 'Trazabilidad', 'Repalletizado', null, 'Salida'],
  ['Fecha', 'Hora', 'Cliente', 'Comitente', 'Remito', 'Tte.', 'Comienzo', 'Fin', 'Recibidor', 'Cond. Ing.', 'Pallets', 'Bultos', 'AR', 'EU', 'DE', 'Bultos', 'Unidades', 'Q', 'Motivo', 'Pallets'],
  [AGO1 + 2, 0.5, 'GOCUOTAS', 'NEWSAN ', '003001949782', 'T', 0.5, 0.51, 'Nahuel', null, 1, 36, 1, null, null, null, 360],
  [AGO1 + 3, 0.6, 'GOCUOTAS', 'SOLNIK S.A.', '0043-00004893', 'T', 0.6, 0.61, 'Nahuel', null, 2, 390, 1, null, null, null, 400],
]

const seguroHoja: Celda[][] = [
  [null, null, null, null, null, null, null, null, null, null, AGO1 + 26, 377270236], // celda del pico
  ['PROPIETARIO', 'FECHA', 'Ubicación', 'SKU', 'Descripcion', 'Suma de QTY', 'TIPO DE UBICACIÓN', '$ VD', '$ almacen', null, 'Etiquetas de fila', 'Suma de $ almacen'],
  ['GOCUOTAS', AGO1, 'REC1', 'SKU1', 'desc', 40, 'BALDA', 200900, 8036000, null, 'GOCUOTAS'],
  ['GOCUOTAS', AGO1, 'REC2', 'SKU1', 'desc', 160, 'BALDA', 200900, 32144000, null, AGO1, 110343800],
  ['GOCUOTAS', AGO1, 'REC3', 'SKU2', 'desc', 89, 'BALDA', 283500, 25231500, null, AGO1 + 1, 120000000],
  ['GOCUOTAS', AGO1, 'REC4', 'SKU3', 'desc', 71, 'BALDA', 117600, 8349600, null, AGO1 + 26, 377270236],
]

const parse = (): FacturaWarehouseParseada => {
  const r = parseFacturaWarehouse({ resumen, out: outHoja, ingresos: inHoja, seguro: seguroHoja })
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('serialAFecha', () => {
  it('convierte el serial de Excel a fecha ISO', () => {
    expect(serialAFecha(46235)).toBe('2026-08-01')
    expect(serialAFecha(46261)).toBe('2026-08-27')
  })
})

describe('parseFacturaWarehouse', () => {
  it('lee los conceptos y el total de la hoja resumen', () => {
    const f = parse()
    expect(f.periodo).toBe('2026-08')
    expect(f.totalFacturado).toBe(1810589.85)
    expect(f.conceptos.map(c => c.item)).toEqual(['IN BULTO', 'ALMACEN', 'OUT UNIDAD', 'INSUMOS', 'SEGURO'])
    expect(f.conceptos[0]).toMatchObject({ cantidad: 426, precio_unitario: 1149.08, total: 489508.08 })
  })

  it('lee el detalle OUT por columna de encabezado y suma unidades y órdenes', () => {
    const f = parse()
    expect(f.out).toHaveLength(3)
    expect(f.out[0]).toEqual({ orden: 'SO-AAA111', sku: 'NM2L15GMW', unidades: 1, fechaEnvio: '2026-08-07' })
    expect(f.unidadesOut).toBe(3)
    expect(f.ordenesOut).toBe(2)
  })

  it('lee las recepciones IN con la primera columna Pallets/Bultos (entrada)', () => {
    const f = parse()
    expect(f.ingresos).toHaveLength(2)
    expect(f.ingresos[1]).toMatchObject({ proveedor: 'SOLNIK S.A.', remito: '0043-00004893', pallets: 2, bultos: 390, unidades: 400 })
    expect(f.bultosIn).toBe(426)
    expect(f.unidadesIn).toBe(760)
  })

  it('arma la serie diaria del seguro deduplicando el pico y lo identifica', () => {
    const f = parse()
    expect(f.seguroDiario).toEqual([
      { fecha: '2026-08-01', valor: 110343800 },
      { fecha: '2026-08-02', valor: 120000000 },
      { fecha: '2026-08-27', valor: 377270236 },
    ])
    expect(f.valorPicoSeguro).toBe(377270236)
    expect(f.fechaPicoSeguro).toBe('2026-08-27')
  })

  it('sin discrepancias no genera avisos', () => {
    expect(parse().avisos).toEqual([])
  })

  it('avisa si la Q facturada no coincide con el detalle', () => {
    const resumenMal = resumen.map(r => (r[1] === 'OUT UNIDAD' ? [null, 'OUT UNIDAD', 'Unidad', AGO1, 5, 5, 2799.81, 13999.05] : r))
    const r = parseFacturaWarehouse({ resumen: resumenMal, out: outHoja, ingresos: inHoja, seguro: seguroHoja })
    if ('error' in r) throw new Error(r.error)
    expect(r.avisos.some(a => a.includes('Unidades OUT'))).toBe(true)
  })

  it('falla con error claro si no está la hoja resumen', () => {
    const r = parseFacturaWarehouse({ resumen: [['otra cosa']], out: outHoja, ingresos: inHoja, seguro: seguroHoja })
    expect(r).toHaveProperty('error')
  })
})

describe('conciliarOutWarehouse', () => {
  const out = parse().out

  it('marca conciliado lo expedido y revisar el resto, contando por orden', () => {
    const estados = new Map([
      ['SO-AAA111', 'expedido'],
      ['SO-BBB222', 'requires_attention'],
    ])
    const r = conciliarOutWarehouse(out, estados)
    expect(r.conciliadas).toBe(1)
    expect(r.revisar).toBe(1)
    expect(r.filas[0]).toMatchObject({ orden: 'SO-AAA111', estado: 'conciliado', motivo: null })
    expect(r.filas[2]).toMatchObject({ orden: 'SO-BBB222', estado: 'revisar', motivo: 'requires_attention' })
  })

  it('una orden que no existe en GOcelular queda para revisar con motivo no_existe', () => {
    const r = conciliarOutWarehouse(out, new Map([['SO-AAA111', 'expedido']]))
    expect(r.revisar).toBe(1)
    expect(r.filas[2].motivo).toBe('no_existe')
  })
})

describe('desgloseWarehouse', () => {
  it('agrupa los conceptos en las tarjetas de la solapa Costos', () => {
    const d = desgloseWarehouse(parse().conceptos)
    expect(d.in).toBeCloseTo(489508.08)
    expect(d.almacen).toBeCloseTo(557682.87)
    expect(d.out).toBeCloseTo(8399.43)
    expect(d.insumos).toBeCloseTo(459)
    expect(d.seguro).toBeCloseTo(754540.47)
    expect(d.otros).toBe(0)
  })

  it('un item desconocido cae en otros', () => {
    const d = desgloseWarehouse([{ item: 'ETIQUETADO', detalle: '', cantidad: 1, precio_unitario: 100, total: 100 }])
    expect(d.otros).toBe(100)
  })
})
