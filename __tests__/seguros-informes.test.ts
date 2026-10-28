import { describe, it, expect } from 'vitest'
import {
  devengoMensual,
  tasaSiniestralidad,
  type CertDevengo,
  type ParametroPct,
} from '@/lib/seguros-informes'

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
