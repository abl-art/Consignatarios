import { describe, it, expect } from 'vitest'
import {
  devengoMensual,
  tasaSiniestralidad,
  COLUMNAS_BROKER,
  filasBroker,
  armarCierre,
  esMesCierreValido,
  type CertDevengo,
  type ParametroPct,
} from '@/lib/seguros-informes'
import type { CertificadoRow } from '@/lib/actions/seguros'

function certBroker(over: Partial<CertificadoRow> = {}): CertificadoRow {
  return {
    id: 'cert-1',
    numero: 1,
    gocuotasOrderId: 'go-1',
    storeOrderId: 'store-1',
    pedidoNumero: 'PED-1',
    dni: '12345678',
    cliente: 'Perez Juan',
    domicilio: 'Calle Falsa 123',
    cp: '1000',
    localidad: 'CABA',
    articulo: 'Motorola Moto G06 4/64GB',
    imei: '350000000000001',
    costoSinIva: 242000,
    sumaAsegurada: 266200,
    costoFuente: 'lista',
    inicioVig: '2026-10-15',
    finVig: '2027-07-15',
    fechaAnula: null,
    motivoAnula: null,
    fechaSiniestro: null,
    estado: 'emitido',
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-10-15T00:00:00Z',
    ...over,
  }
}

function certDevengo(over: Partial<CertDevengo> = {}): CertDevengo {
  return {
    costoSinIva: 242000,
    sumaAsegurada: 266200,
    inicioVig: '2026-10-15',
    finVig: '2027-07-15',
    fechaAnula: null,
    fechaSiniestro: null,
    estado: 'emitido',
    ...over,
  }
}

const PRIMA_2 = [{ porcentaje: 2, vigenteDesde: '2026-01' }]
const INGRESO_3 = [{ porcentaje: 3, vigenteDesde: '2026-01' }]

describe('devengoMensual', () => {
  it('cert 2026-10-15 → 2027-07-15: devenga oct..jul (10 meses calendario), oct con prima 5324 / ingreso 7260 / resultado 1936', () => {
    const resultado = devengoMensual([certDevengo()], PRIMA_2, INGRESO_3, '2027-07')

    expect(resultado).toHaveLength(10)
    expect(resultado.map(m => m.mes)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
    ])

    const oct = resultado[0]
    expect(oct.certificados).toBe(1)
    expect(oct.sumaVigente).toBe(266200)
    expect(oct.prima).toBe(5324)
    expect(oct.ingreso).toBe(7260)
    expect(oct.resultado).toBe(1936)

    // devenga en todos los meses del rango, incluido el último (jul) inclusive
    const jul = resultado[resultado.length - 1]
    expect(jul.mes).toBe('2027-07')
    expect(jul.certificados).toBe(1)
  })

  it('cert anulado 2026-11-03: devenga oct y nov, dic no (mes incluido con ceros, no se omite)', () => {
    const cert = certDevengo({
      inicioVig: '2026-10-01',
      fechaAnula: '2026-11-03',
      finVig: '2027-07-01',
    })

    const resultado = devengoMensual([cert], PRIMA_2, INGRESO_3, '2026-12')

    expect(resultado.map(m => m.mes)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(resultado[0].certificados).toBe(1) // oct
    expect(resultado[1].certificados).toBe(1) // nov
    expect(resultado[2].certificados).toBe(0) // dic: no devenga, pero el mes se incluye con ceros
    expect(resultado[2].prima).toBe(0)
    expect(resultado[2].ingreso).toBe(0)
    expect(resultado[2].resultado).toBe(0)
  })

  it('fechaSiniestro 2026-12-20: devenga hasta dic inclusive, ene no', () => {
    const cert = certDevengo({
      inicioVig: '2026-10-01',
      fechaSiniestro: '2026-12-20',
      finVig: '2027-07-01',
    })

    const resultado = devengoMensual([cert], PRIMA_2, INGRESO_3, '2027-01')

    expect(resultado.map(m => m.mes)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01'])
    expect(resultado[2].mes).toBe('2026-12')
    expect(resultado[2].certificados).toBe(1)
    expect(resultado[3].mes).toBe('2027-01')
    expect(resultado[3].certificados).toBe(0)
  })

  it('tramos de % por vigencia: prima 2 desde 2026-01 + prima 1.8 desde 2026-12 → nov usa 2, dic usa 1.8 (lista de parámetros sin ordenar)', () => {
    const primas: ParametroPct[] = [
      { porcentaje: 1.8, vigenteDesde: '2026-12' }, // a propósito fuera de orden
      { porcentaje: 2, vigenteDesde: '2026-01' },
    ]
    const cert = certDevengo({
      inicioVig: '2026-10-01',
      finVig: '2027-07-01',
      sumaAsegurada: 100000,
      costoSinIva: 100000,
    })

    const resultado = devengoMensual([cert], primas, [{ porcentaje: 0, vigenteDesde: '2026-01' }], '2026-12')

    const nov = resultado.find(m => m.mes === '2026-11')!
    const dic = resultado.find(m => m.mes === '2026-12')!
    expect(nov.prima).toBe(2000) // 100000 * 2%
    expect(dic.prima).toBe(1800) // 100000 * 1.8%
  })

  it('corrección en el mismo mes calendario: tramo 2.5 vigente 2026-11-03 y tramo 2.2 vigente 2026-11-15 → noviembre Y diciembre usan 2.2 (gana el vigenteDesde completo más reciente, no el más viejo del mismo mes)', () => {
    const primas: ParametroPct[] = [
      { porcentaje: 2.5, vigenteDesde: '2026-11-03' },
      { porcentaje: 2.2, vigenteDesde: '2026-11-15' },
    ]
    const cert = certDevengo({
      inicioVig: '2026-11-01',
      finVig: '2027-07-01',
      sumaAsegurada: 100000,
      costoSinIva: 100000,
    })

    const resultado = devengoMensual([cert], primas, [{ porcentaje: 0, vigenteDesde: '2026-01' }], '2026-12')

    const nov = resultado.find(m => m.mes === '2026-11')!
    const dic = resultado.find(m => m.mes === '2026-12')!
    // la corrección rige para TODO noviembre (el tramo arranca a mitad de
    // mes pero el % gobierna el mes calendario entero) y también diciembre
    expect(nov.prima).toBe(2200) // 100000 * 2.2%, no 2500
    expect(dic.prima).toBe(2200)
  })

  it('mes anterior a todos los tramos: 0% por fallback (gap de configuración), el mes siguiente ya cubierto devenga normal', () => {
    const cert = certDevengo({
      inicioVig: '2026-09-01', // un mes antes del primer tramo de prima/ingreso
      finVig: '2027-07-01',
      sumaAsegurada: 100000,
      costoSinIva: 100000,
    })
    const primas: ParametroPct[] = [{ porcentaje: 2, vigenteDesde: '2026-10' }]
    const ingresos: ParametroPct[] = [{ porcentaje: 3, vigenteDesde: '2026-10' }]

    const resultado = devengoMensual([cert], primas, ingresos, '2026-10')

    const sep = resultado.find(m => m.mes === '2026-09')!
    const oct = resultado.find(m => m.mes === '2026-10')!
    expect(sep.certificados).toBe(1) // vigente, pero sin tramo cargado todavía
    expect(sep.prima).toBe(0)
    expect(sep.ingreso).toBe(0)
    expect(oct.prima).toBe(2000) // 100000 * 2%, ya con el tramo vigente
    expect(oct.ingreso).toBe(3000) // 100000 * 3%
  })

  it('fechaAnula en el mismo mes que inicioVig: devenga exactamente 1 mes', () => {
    const cert = certDevengo({
      inicioVig: '2026-10-01',
      fechaAnula: '2026-10-20',
      finVig: '2027-07-01',
    })

    const resultado = devengoMensual([cert], PRIMA_2, INGRESO_3, '2026-11')

    expect(resultado.map(m => m.mes)).toEqual(['2026-10', '2026-11'])
    expect(resultado[0].certificados).toBe(1)
    expect(resultado[1].certificados).toBe(0)
  })

  it('certificados con estado pendiente no devengan (no cuentan ni para los meses ni para los montos)', () => {
    const pendiente = certDevengo({ estado: 'pendiente', inicioVig: '2026-08-01', finVig: '2026-08-31' })
    const vigente = certDevengo({ inicioVig: '2026-10-01', finVig: '2026-10-31' })

    // El pendiente, aunque tiene fechas anteriores, no debe adelantar el primer mes del rango ni sumar
    const resultado = devengoMensual([pendiente, vigente], PRIMA_2, INGRESO_3, '2026-10')

    expect(resultado.map(m => m.mes)).toEqual(['2026-10'])
    expect(resultado[0].certificados).toBe(1)
  })

  it('solo certificados pendientes: lista vacía (no hay ningún mes vigente que ancle el rango)', () => {
    const cert = certDevengo({ estado: 'pendiente' })
    expect(devengoMensual([cert], PRIMA_2, INGRESO_3, '2026-10')).toEqual([])
  })

  it('sin certificados: lista vacía', () => {
    expect(devengoMensual([], PRIMA_2, INGRESO_3, '2026-12')).toEqual([])
  })
})

describe('tasaSiniestralidad', () => {
  it('10 emitidos, 1 con fechaSiniestro → 10%', () => {
    const certs = Array.from({ length: 10 }, (_, i) => ({
      fechaSiniestro: i === 0 ? '2026-12-20' : null,
      estado: 'emitido',
    }))

    expect(tasaSiniestralidad(certs)).toEqual({ emitidos: 10, siniestrados: 1, tasaPct: 10 })
  })

  it('sin emitidos: tasaPct 0, sin división por cero', () => {
    expect(tasaSiniestralidad([])).toEqual({ emitidos: 0, siniestrados: 0, tasaPct: 0 })
  })
})

describe('COLUMNAS_BROKER', () => {
  it('encabezado exacto de 19 columnas, en orden', () => {
    expect(COLUMNAS_BROKER).toEqual([
      'N° certificado ',
      'Tipo ',
      'Nº Documento',
      'Cliente (Apellido y Nombre)',
      'Domicilio',
      'Codigo Postal',
      'Localidad',
      'Articulo (Descripcion, marca, modelo)',
      'IMEI',
      'SUMA ASEGURADA',
      'Fecha Factura',
      'Fecha Anula',
      'Inicio Vig',
      'Fin Vig',
      'Tipo de comprobante (fac A/B - NC A/B)',
      'Nº Factura',
      'Fecha Siniestro',
      'N° Orden GOcuotas',
      'N° Pedido GOcelular',
    ])
    expect(COLUMNAS_BROKER).toHaveLength(19)
  })
})

describe('filasBroker', () => {
  it('fila completa con factura: Tipo DNI, comprobante Factura B, fechas DD/MM/YYYY', () => {
    const cert = certBroker()
    const facturas = new Map([['go-1', { numero: 'FB-001', fecha: '2026-10-16' }]])

    const filas = filasBroker([cert], facturas)

    expect(filas).toEqual([[
      1,
      'DNI',
      '12345678',
      'Perez Juan',
      'Calle Falsa 123',
      '1000',
      'CABA',
      'Motorola Moto G06 4/64GB',
      '350000000000001',
      266200,
      '16/10/2026',
      null,
      '15/10/2026',
      '15/07/2027',
      'Factura B',
      'FB-001',
      null,
      'go-1',
      'PED-1',
    ]])
  })

  it('cert sin factura: Fecha Factura (col 11) y Nº Factura (col 16) en null', () => {
    const cert = certBroker()

    const filas = filasBroker([cert], new Map())

    expect(filas[0][10]).toBeNull()
    expect(filas[0][15]).toBeNull()
  })

  it('cert estado pendiente: excluido del reporte', () => {
    const pendiente = certBroker({ estado: 'pendiente', numero: null, gocuotasOrderId: 'go-pend' })
    const emitido = certBroker({ numero: 2, gocuotasOrderId: 'go-2' })

    const filas = filasBroker([pendiente, emitido], new Map())

    expect(filas).toHaveLength(1)
    expect(filas[0][17]).toBe('go-2')
  })

  it('cert anulado: incluido, con su Fecha Anula (col 12) formateada', () => {
    const anulado = certBroker({ fechaAnula: '2026-11-03', motivoAnula: 'descartada' })

    const filas = filasBroker([anulado], new Map())

    expect(filas).toHaveLength(1)
    expect(filas[0][11]).toBe('03/11/2026')
  })

  it('cert con siniestro: Fecha Siniestro (col 17) formateada; sin siniestro, null', () => {
    const siniestrado = certBroker({ fechaSiniestro: '2026-12-20' })
    const sinSiniestro = certBroker({ numero: 2, gocuotasOrderId: 'go-2' })

    expect(filasBroker([siniestrado], new Map())[0][16]).toBe('20/12/2026')
    expect(filasBroker([sinSiniestro], new Map())[0][16]).toBeNull()
  })

  it('ordena las filas por numero ascendente', () => {
    const c2 = certBroker({ numero: 2, gocuotasOrderId: 'go-2' })
    const c1 = certBroker({ numero: 1, gocuotasOrderId: 'go-1' })

    const filas = filasBroker([c2, c1], new Map())

    expect(filas.map(f => f[0])).toEqual([1, 2])
  })
})

describe('armarCierre', () => {
  it('resumen.prima/ingreso/resultado/sumaVigente/certificados iguales a la fila del mes de devengoMensual (caso pinned: costo 242000/suma 266200, prima 2%, ingreso 3%, mes 2026-10 → 5324/7260/1936)', () => {
    const cert = certBroker()
    const { resumen } = armarCierre([cert], new Map(), PRIMA_2, INGRESO_3, '2026-10')

    expect(resumen.mes).toBe('2026-10')
    expect(resumen.sumaVigente).toBe(266200)
    expect(resumen.prima).toBe(5324)
    expect(resumen.ingreso).toBe(7260)
    expect(resumen.resultado).toBe(1936)
    expect(resumen.certificados).toBe(1)
  })

  it('conteos por estado relativos al mes pedido: 1 vigente + 1 anulado + 1 siniestrado + 1 pendiente', () => {
    const vigente = certBroker({ numero: 1, gocuotasOrderId: 'go-1' })
    const anulado = certBroker({ numero: 2, gocuotasOrderId: 'go-2', fechaAnula: '2026-10-20' })
    const siniestrado = certBroker({ numero: 3, gocuotasOrderId: 'go-3', fechaSiniestro: '2026-10-15' })
    const pendiente = certBroker({ numero: null, gocuotasOrderId: 'go-4', estado: 'pendiente', costoSinIva: null, sumaAsegurada: null })

    const { resumen } = armarCierre([vigente, anulado, siniestrado, pendiente], new Map(), PRIMA_2, INGRESO_3, '2026-10')

    expect(resumen.vigentes).toBe(1)
    expect(resumen.anulados).toBe(1)
    expect(resumen.siniestrados).toBe(1)
    expect(resumen.pendientes).toBe(1)
    expect(resumen.certificados).toBe(4)
  })

  it('filas === filasBroker(certs, facturas) (pendiente excluido de filas pero contado en resumen)', () => {
    const vigente = certBroker({ numero: 1, gocuotasOrderId: 'go-1' })
    const anulado = certBroker({ numero: 2, gocuotasOrderId: 'go-2', fechaAnula: '2026-10-20' })
    const siniestrado = certBroker({ numero: 3, gocuotasOrderId: 'go-3', fechaSiniestro: '2026-10-15' })
    const pendiente = certBroker({ numero: null, gocuotasOrderId: 'go-4', estado: 'pendiente', costoSinIva: null, sumaAsegurada: null })
    const certs = [vigente, anulado, siniestrado, pendiente]
    const facturas = new Map([['go-1', { numero: 'FB-001', fecha: '2026-10-16' }]])

    const { resumen, filas } = armarCierre(certs, facturas, PRIMA_2, INGRESO_3, '2026-10')

    expect(filas).toEqual(filasBroker(certs, facturas))
    expect(filas).toHaveLength(3) // pendiente excluido
    expect(resumen.certificados).toBe(4) // pero contado en el resumen
  })

  it('cert con fechaAnula posterior al mes pedido: cuenta como vigente en ese mes y devenga (el cierre de octubre no sabe de una anulación de noviembre)', () => {
    const cert = certBroker({ fechaAnula: '2026-11-03' })

    const { resumen } = armarCierre([cert], new Map(), PRIMA_2, INGRESO_3, '2026-10')

    expect(resumen.vigentes).toBe(1)
    expect(resumen.anulados).toBe(0)
    expect(resumen.sumaVigente).toBe(266200)
    expect(resumen.prima).toBe(5324)
  })

  it('mes sin devengo (sin certs emitidos): resumen en ceros y filas []', () => {
    const { resumen, filas } = armarCierre([], new Map(), PRIMA_2, INGRESO_3, '2026-10')

    expect(resumen).toEqual({
      mes: '2026-10',
      certificados: 0,
      vigentes: 0,
      anulados: 0,
      siniestrados: 0,
      pendientes: 0,
      sumaVigente: 0,
      prima: 0,
      ingreso: 0,
      resultado: 0,
    })
    expect(filas).toEqual([])
  })
})

describe('esMesCierreValido', () => {
  it('acepta un mes pasado bien formado', () => {
    expect(esMesCierreValido('2026-09', '2026-10')).toBe(true)
    expect(esMesCierreValido('2025-12', '2026-10')).toBe(true)
  })

  it('rechaza el mes actual y meses futuros (todavía no cerraron)', () => {
    expect(esMesCierreValido('2026-10', '2026-10')).toBe(false)
    expect(esMesCierreValido('2027-03', '2026-10')).toBe(false)
  })

  it('rechaza formatos inválidos (sin padding, mes 13, basura)', () => {
    expect(esMesCierreValido('2026-9', '2026-10')).toBe(false)
    expect(esMesCierreValido('2026-13', '2026-10')).toBe(false)
    expect(esMesCierreValido('2026-00', '2026-10')).toBe(false)
    expect(esMesCierreValido('garbage', '2026-10')).toBe(false)
    expect(esMesCierreValido('2026-09-01', '2026-10')).toBe(false)
  })
})
