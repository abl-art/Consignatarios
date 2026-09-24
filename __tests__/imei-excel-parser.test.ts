import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseImeiExcel, luhnValido } from '@/lib/imei-excel-parser'

// IMEIs Luhn-validos precomputados
const IMEI_A = '354581531507664'
const IMEI_B = '354581531507672'
const IMEI_C = '351755488512868'

function xlsxB64(rows: unknown[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
}

function xlsxB64Multi(sheets: { name: string; rows: unknown[][] }[]): string {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name)
  }
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
}

describe('luhnValido', () => {
  it('acepta IMEI valido y rechaza invalido', () => {
    expect(luhnValido(IMEI_A)).toBe(true)
    expect(luhnValido('354581531507665')).toBe(false)
    expect(luhnValido('123')).toBe(false)
  })
})

describe('parseImeiExcel', () => {
  const skus = new Set(['PB970105AR', 'SM-A075MZKEARO'])

  it('detecta columnas por contenido y agrupa IMEIs por SKU', () => {
    const b64 = xlsxB64([
      ['SKU', 'EAN', 'IMEI', 'OTRA COSA'],
      ['PB970105AR', '7790894902032', IMEI_A, 'x'],
      ['PB970105AR', '7790894902032', IMEI_B, 'y'],
      ['SM-A075MZKEARO', '8806099122249', IMEI_C, 'z'],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines).toHaveLength(2)
    const moto = r.lines.find(l => l.sku === 'PB970105AR')!
    expect(moto.imeis).toEqual([IMEI_A, IMEI_B])
    expect(moto.ean).toBe('7790894902032')
  })

  it('funciona con columnas en otro orden y sin encabezados', () => {
    const b64 = xlsxB64([
      [IMEI_A, 'PB970105AR', '7790894902032'],
      [IMEI_B, 'PB970105AR', '7790894902032'],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines[0].sku).toBe('PB970105AR')
    expect(r.lines[0].imeis).toHaveLength(2)
  })

  it('reporta IMEIs con Luhn invalido', () => {
    const b64 = xlsxB64([
      ['SKU', 'IMEI', 'EAN'],
      ['PB970105AR', IMEI_A, '7790894902032'],
      ['PB970105AR', '354581531507665', '7790894902032'],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores.some(e => e.includes('354581531507665'))).toBe(true)
  })

  it('reporta error claro si no encuentra columna de IMEIs', () => {
    const b64 = xlsxB64([
      ['SKU', 'EAN'],
      ['PB970105AR', '7790894902032'],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores.some(e => e.toLowerCase().includes('imei'))).toBe(true)
  })

  it('parsea texto plano legacy (CSV) ademas de xlsx base64', () => {
    const csv = `sku;ean;imei\nPB970105AR;7790894902032;${IMEI_A}`
    const r = parseImeiExcel(csv, skus)
    expect(r.errores).toEqual([])
    expect(r.lines[0].imeis).toEqual([IMEI_A])
  })

  it('parsea celdas numericas sin corrupcion en notacion cientifica', () => {
    const b64 = xlsxB64([
      ['SKU', 'EAN', 'IMEI'],
      ['PB970105AR', 7790894902032, 354581531507664],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines[0].ean).toBe('7790894902032')
    expect(r.lines[0].imeis).toEqual(['354581531507664'])
  })

  it('maneja celdas SKU merged con forward-fill', () => {
    const b64 = xlsxB64([
      ['SKU', 'IMEI'],
      ['PB970105AR', IMEI_A],
      ['', IMEI_B],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].sku).toBe('PB970105AR')
    expect(r.lines[0].imeis).toEqual([IMEI_A, IMEI_B])
  })

  it('reporta IMEI duplicado', () => {
    const b64 = xlsxB64([
      ['SKU', 'IMEI'],
      ['PB970105AR', IMEI_A],
      ['PB970105AR', IMEI_A],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores.some(e => e.includes('duplicado'))).toBe(true)
    expect(r.lines[0].imeis).toHaveLength(1)
    expect(r.lines[0].imeis).toEqual([IMEI_A])
  })

  it('encuentra los IMEIs aunque la hoja de datos no sea la primera (formato Newsan)', () => {
    const b64 = xlsxB64Multi([
      {
        name: 'Parametros',
        rows: [
          ['Parametros', ''],
          ['Org. Inventario', 'MCH'],
          ['FC', 'A-0039-00680820'],
          ['IMEI', ''],
        ],
      },
      {
        name: 'XXE OM Rep Comercial Consulta',
        rows: [
          ['ORGANIZACION', 'PRODUCTO', 'NUMERO_SERIE', 'IMEI', 'EAN'],
          // La columna "IMEI" de Newsan trae un numero interno de 15 digitos que NO es IMEI
          // (no pasa Luhn); los IMEIs reales vienen en NUMERO_SERIE.
          ['Monte Chingolo', '91PBBJ0016AR', IMEI_A, '075970000092069', '7790894901967'],
          ['Monte Chingolo', '91PBBJ0016AR', IMEI_B, '075970000092068', '7790894901967'],
          ['Monte Chingolo', '91PBBJ0016AR', IMEI_C, '075970000092070', '7790894901967'],
        ],
      },
    ])
    // El SKU de Newsan no esta en el catalogo: debe elegir la columna por su encabezado PRODUCTO
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].sku).toBe('91PBBJ0016AR')
    expect(r.lines[0].imeis).toEqual([IMEI_A, IMEI_B, IMEI_C])
    expect(r.lines[0].ean).toBe('7790894901967')
  })

  it('usa el encabezado (SKU/PRODUCTO/ARTICULO) para la columna de SKU cuando no matchea el catalogo', () => {
    const b64 = xlsxB64([
      ['ORGANIZACION', 'ARTICULO', 'IMEI'],
      ['Monte Chingolo', 'SKU-NUEVO-1', IMEI_A],
      ['Monte Chingolo', 'SKU-NUEVO-1', IMEI_B],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].sku).toBe('SKU-NUEVO-1')
    expect(r.lines[0].imeis).toEqual([IMEI_A, IMEI_B])
  })

  // Tablets (novedades de Pedro 23/9/2026): se identifican por numero de serie en la
  // columna IMEI/SN, item_type device con serials. El modo es opt-in (permitirSeriales)
  // para no cambiar el comportamiento de los Excels de celulares.
  describe('modo seriales (tablets)', () => {
    const skusTablets = new Set(['SAM-A11-64', 'SAM-A11PLUS-128', 'PB970105AR'])

    it('parsea el formato real de MULTIPOINT (SKU | IMEI/SN | EAN) agrupando serials por SKU', () => {
      const b64 = xlsxB64([
        ['SKU', 'IMEI/SN', 'EAN'],
        ['SM-X133NZAAL09', 'R8YL303PA8J', 8806097820796],
        ['SM-X133NZAAL09', 'R8YL303PACE', 8806097820796],
        ['SM-X230NZAAL09', 'R5GL704TB8D', 8806097886785],
      ])
      const r = parseImeiExcel(b64, skusTablets, { permitirSeriales: true })
      expect(r.errores).toEqual([])
      expect(r.lines).toHaveLength(2)
      const a11 = r.lines.find(l => l.sku === 'SM-X133NZAAL09')!
      expect(a11.serials).toEqual(['R8YL303PA8J', 'R8YL303PACE'])
      expect(a11.imeis).toEqual([])
      expect(a11.ean).toBe('8806097820796')
    })

    it('distingue la columna de seriales de la de SKU aunque ambas sean alfanumericas (por valores distintos)', () => {
      // SKUs desconocidos para el catalogo y repetidos por fila; los seriales son unicos
      const b64 = xlsxB64([
        ['SKU', 'IMEI/SN'],
        ['TAB-NUEVA-64', 'R8AAA0001AA'],
        ['TAB-NUEVA-64', 'R8AAA0002BB'],
        ['TAB-NUEVA-64', 'R8AAA0003CC'],
      ])
      const r = parseImeiExcel(b64, new Set<string>(), { permitirSeriales: true })
      expect(r.errores).toEqual([])
      expect(r.lines).toHaveLength(1)
      expect(r.lines[0].sku).toBe('TAB-NUEVA-64')
      expect(r.lines[0].serials).toEqual(['R8AAA0001AA', 'R8AAA0002BB', 'R8AAA0003CC'])
    })

    it('maneja un Excel mixto de celulares (IMEI) y tablets (serial) en la misma columna', () => {
      const b64 = xlsxB64([
        ['SKU', 'IMEI/SN', 'EAN'],
        ['PB970105AR', IMEI_A, '7790894902032'],
        ['SAM-A11-64', 'R8YL303PA8J', '8806097820796'],
      ])
      const r = parseImeiExcel(b64, skusTablets, { permitirSeriales: true })
      expect(r.errores).toEqual([])
      const moto = r.lines.find(l => l.sku === 'PB970105AR')!
      expect(moto.imeis).toEqual([IMEI_A])
      expect(moto.serials).toEqual([])
      const tab = r.lines.find(l => l.sku === 'SAM-A11-64')!
      expect(tab.serials).toEqual(['R8YL303PA8J'])
      expect(tab.imeis).toEqual([])
    })

    it('reporta error si un mismo SKU mezcla IMEIs y seriales', () => {
      const b64 = xlsxB64([
        ['SKU', 'IMEI/SN'],
        ['SAM-A11-64', IMEI_A],
        ['SAM-A11-64', 'R8YL303PA8J'],
      ])
      const r = parseImeiExcel(b64, skusTablets, { permitirSeriales: true })
      expect(r.errores.some(e => e.includes('SAM-A11-64') && e.toLowerCase().includes('mezcla'))).toBe(true)
    })

    it('reporta serial duplicado', () => {
      const b64 = xlsxB64([
        ['SKU', 'IMEI/SN'],
        ['SAM-A11-64', 'R8YL303PA8J'],
        ['SAM-A11-64', 'R8YL303PA8J'],
      ])
      const r = parseImeiExcel(b64, skusTablets, { permitirSeriales: true })
      expect(r.errores.some(e => e.includes('duplicado') && e.includes('R8YL303PA8J'))).toBe(true)
      expect(r.lines[0].serials).toEqual(['R8YL303PA8J'])
    })

    it('sigue validando Luhn para valores de 15 digitos aun en modo seriales', () => {
      const b64 = xlsxB64([
        ['SKU', 'IMEI/SN'],
        ['SAM-A11-64', 'R8YL303PA8J'],
        ['PB970105AR', '354581531507665'],
      ])
      const r = parseImeiExcel(b64, skusTablets, { permitirSeriales: true })
      expect(r.errores.some(e => e.includes('354581531507665'))).toBe(true)
      expect(r.lines.find(l => l.sku === 'SAM-A11-64')!.serials).toEqual(['R8YL303PA8J'])
    })

    it('con el modo apagado un Excel de solo seriales sigue reportando que no hay IMEIs', () => {
      const b64 = xlsxB64([
        ['SKU', 'IMEI/SN'],
        ['SAM-A11-64', 'R8YL303PA8J'],
      ])
      const r = parseImeiExcel(b64, skusTablets)
      expect(r.errores.length).toBeGreaterThan(0)
      expect(r.lines).toEqual([])
    })
  })

  it('parsea un CSV plano codificado en base64 (lo que sube el navegador via FileReader)', () => {
    const csv = `sku;ean;imei\nPB970105AR;7790894902032;${IMEI_A}\n`
    const b64 = Buffer.from(csv).toString('base64')
    expect(b64.length).toBeGreaterThanOrEqual(50) // heuristica esBase64Xlsx
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].sku).toBe('PB970105AR')
    expect(r.lines[0].imeis).toEqual([IMEI_A])
    expect(r.lines[0].ean).toBe('7790894902032')
  })
})
