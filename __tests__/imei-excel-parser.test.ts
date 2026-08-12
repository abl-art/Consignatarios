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
})
