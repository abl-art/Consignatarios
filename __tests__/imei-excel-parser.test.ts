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
