import { describe, it, expect } from 'vitest'
import { eanProvisorio, esEan13Valido, digitoVerificadorEan } from '@/lib/ean-provisorio'

describe('digitoVerificadorEan', () => {
  it('calcula el verificador de EANs reales conocidos', () => {
    // 7790895000782 es un EAN-13 argentino real (779 = GS1 Argentina)
    expect(digitoVerificadorEan('779089500078')).toBe(2)
    // 4006381333931 (ejemplo clásico de la especificación GS1)
    expect(digitoVerificadorEan('400638133393')).toBe(1)
  })
})

describe('esEan13Valido', () => {
  it('acepta un EAN-13 válido y rechaza verificador incorrecto', () => {
    expect(esEan13Valido('4006381333931')).toBe(true)
    expect(esEan13Valido('4006381333932')).toBe(false)
  })
  it('rechaza largos y caracteres inválidos', () => {
    expect(esEan13Valido('299123')).toBe(false)
    expect(esEan13Valido('29912345678901')).toBe(false)
    expect(esEan13Valido('299ABC4567890')).toBe(false)
  })
})

describe('eanProvisorio', () => {
  it('genera un EAN-13 válido con prefijo 299', () => {
    const ean = eanProvisorio('FR901D-NS')
    expect(ean).toHaveLength(13)
    expect(ean.startsWith('299')).toBe(true)
    expect(esEan13Valido(ean)).toBe(true)
  })

  it('es determinístico: mismo SKU, mismo EAN (reintentos y reenvíos no duplican altas)', () => {
    expect(eanProvisorio('FR901D-NS')).toBe(eanProvisorio('FR901D-NS'))
  })

  it('normaliza espacios y mayúsculas del SKU', () => {
    expect(eanProvisorio(' fr901d-ns ')).toBe(eanProvisorio('FR901D-NS'))
  })

  it('SKUs distintos generan EANs distintos', () => {
    const skus = ['FR901D-NS', '43A42K', 'CA8143N', 'PE1821NPN', 'VHU7050AR', 'LNV-LE08F12-BL', 'KS-SAM-A16', 'PBRIIINGNE20']
    const eans = new Set(skus.map(eanProvisorio))
    expect(eans.size).toBe(skus.length)
  })
})
