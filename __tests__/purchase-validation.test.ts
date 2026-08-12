import { describe, it, expect } from 'vitest'
import { validarCompra, type CatalogoGocelular } from '@/lib/purchase-validation'
import type { PurchaseLine } from '@/lib/gocelular-webhook'

const IMEI_A = '354581531507664'
const IMEI_B = '354581531507672'

const catalogo: CatalogoGocelular = {
  proveedoresActivos: ['MIRGOR SA'],
  deviceSkusActivos: new Set(['PB970105AR']),
  deviceSkusInactivos: new Set(['SKU-VIEJO']),
  addonSkus: new Set(['KS-MOTO-G06']),
  imeisExistentes: new Set(),
}

const lineaDevice: PurchaseLine = {
  line_reference: 'L1', item_type: 'device', sku: 'PB970105AR', imeis: [IMEI_A], unit_cost: '185000.00',
}
const lineaAddon: PurchaseLine = {
  line_reference: 'L2', item_type: 'addon', sku: 'KS-MOTO-G06', quantity: 10, unit_cost: '12500.00',
}

describe('validarCompra', () => {
  it('pasa con proveedor y SKUs validos', () => {
    const r = validarCompra('MIRGOR SA', [lineaDevice, lineaAddon], catalogo)
    expect(r.errores).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('matchea proveedor case-insensitive con trim', () => {
    const r = validarCompra('  mirgor sa ', [lineaDevice], catalogo)
    expect(r.errores).toEqual([])
  })

  it('error si el proveedor no matchea ninguno activo', () => {
    const r = validarCompra('ACME SA', [lineaDevice], catalogo)
    expect(r.errores.some(e => e.includes('ACME SA'))).toBe(true)
  })

  it('error si el proveedor matchea mas de uno (duplicados en su catalogo)', () => {
    const cat = { ...catalogo, proveedoresActivos: ['SYNA SA', 'syna sa'] }
    const r = validarCompra('SYNA SA', [lineaDevice], cat)
    expect(r.errores.some(e => e.toLowerCase().includes('más de un proveedor'))).toBe(true)
  })

  it('SKU device inactivo es error (rechazaria la compra completa)', () => {
    const r = validarCompra('MIRGOR SA', [{ ...lineaDevice, sku: 'SKU-VIEJO' }], catalogo)
    expect(r.errores.some(e => e.includes('SKU-VIEJO'))).toBe(true)
  })

  it('SKU sin match es warning (pending_alias), no error', () => {
    const r = validarCompra('MIRGOR SA', [{ ...lineaDevice, sku: 'SKU-NUEVO' }], catalogo)
    expect(r.errores).toEqual([])
    expect(r.warnings.some(w => w.includes('SKU-NUEVO'))).toBe(true)
  })

  it('IMEI ya existente en inventario GOcelular es error', () => {
    const cat = { ...catalogo, imeisExistentes: new Set([IMEI_A]) }
    const r = validarCompra('MIRGOR SA', [lineaDevice], cat)
    expect(r.errores.some(e => e.includes(IMEI_A))).toBe(true)
  })

  it('IMEI duplicado entre lineas es error', () => {
    const l2: PurchaseLine = { ...lineaDevice, line_reference: 'L3', imeis: [IMEI_A] }
    const r = validarCompra('MIRGOR SA', [lineaDevice, l2], catalogo)
    expect(r.errores.some(e => e.includes('duplicado'))).toBe(true)
  })

  it('addon sin unit_cost es error', () => {
    const sinCosto = { ...lineaAddon, unit_cost: undefined }
    const r = validarCompra('MIRGOR SA', [sinCosto], catalogo)
    expect(r.errores.some(e => e.includes('L2'))).toBe(true)
  })

  it('monto con formato invalido es error', () => {
    const r = validarCompra('MIRGOR SA', [{ ...lineaAddon, unit_cost: '12.500,00' }], catalogo)
    expect(r.errores.some(e => e.includes('12.500,00'))).toBe(true)
  })

  it('mas de 5000 unidades totales es error', () => {
    const grande: PurchaseLine = { ...lineaAddon, quantity: 5001 }
    const r = validarCompra('MIRGOR SA', [grande], catalogo)
    expect(r.errores.some(e => e.includes('5000') || e.includes('5.000'))).toBe(true)
  })

  it('junta TODOS los errores en una pasada, no corta en el primero', () => {
    const cat = { ...catalogo, imeisExistentes: new Set([IMEI_A]) }
    const r = validarCompra('ACME SA', [lineaDevice, { ...lineaAddon, unit_cost: undefined }], cat)
    expect(r.errores.length).toBeGreaterThanOrEqual(3)
  })
})
