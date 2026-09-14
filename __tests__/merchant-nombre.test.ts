import { describe, it, expect } from 'vitest'
import { nombreMerchant, type StoreNombreRow } from '@/lib/merchant-nombre'

const row = (storeName: string, over: Partial<StoreNombreRow> = {}): StoreNombreRow => ({
  merchantName: null,
  storeName,
  updatedAt: '2026-09-14 00:00:00+00',
  ...over,
})

describe('nombreMerchant', () => {
  it('sin tiendas devuelve null', () => {
    expect(nombreMerchant([])).toBeNull()
  })

  it('usa merchant_name cuando existe, el más reciente', () => {
    const stores = [
      row('Plus Phone Santa Fe', { merchantName: 'Plus Phone Viejo', updatedAt: '2026-01-01 00:00:00+00' }),
      row('Plus Phone Santa Fe', { merchantName: 'Plus Phone' }),
    ]
    expect(nombreMerchant(stores)).toBe('Plus Phone')
  })

  it('merchant_name vacío o con espacios cuenta como ausente', () => {
    expect(nombreMerchant([row('Music House - GOcelular', { merchantName: '  ' })])).toBe('Music House')
  })

  it('caso GEO: la dirección va primero, el merchant es el segmento común a todas', () => {
    const stores = [
      row('9 de Julio 5 - Geo Comunicaciones - GOcelular.'),
      row('Dean Funes 2 - Geo Comunicaciones - GOcelular'),
      row('Amadeo Sabattini 3250 - Geo Comunicaciones'),
      row('General Paz 101 - Geo Comunicaciones - GOcelular.'),
    ]
    expect(nombreMerchant(stores)).toBe('Geo Comunicaciones')
  })

  it('convención habitual: merchant primero, sucursal después', () => {
    const stores = [
      row('IB Technology - GOcelular - San Martin 1992'),
      row('IB Technology - GOcelular - Filippini 2070'),
    ]
    expect(nombreMerchant(stores)).toBe('IB Technology')
  })

  it('tienda única: primer segmento, salteando GOcelular', () => {
    expect(nombreMerchant([row('Genesio Hogar - GOcelular - Colonia Caroya')])).toBe('Genesio Hogar')
    expect(nombreMerchant([row('Music House - GOcelular')])).toBe('Music House')
    expect(nombreMerchant([row('Accesorios.com.ar - San Martin 7 - GOcelular')])).toBe('Accesorios.com.ar')
  })

  it('tienda única sin separadores devuelve el nombre entero', () => {
    expect(nombreMerchant([row('Hendel Alejandro GOcelular')])).toBe('Hendel Alejandro GOcelular')
  })

  it('sucursales numeradas: prefijo común de palabras', () => {
    const stores = [
      row('Send 3 - GOcelular'),
      row('Send 12 - GOcelular'),
      row('Send 17 - GOcelular'),
    ]
    expect(nombreMerchant(stores)).toBe('Send')
  })

  it('varias tiendas sin nada en común: primer segmento de la más reciente', () => {
    const stores = [
      row('Alfa Store - GOcelular', { updatedAt: '2026-01-01 00:00:00+00' }),
      row('Beta Local - GOcelular', { updatedAt: '2026-02-01 00:00:00+00' }),
    ]
    expect(nombreMerchant(stores)).toBe('Beta Local')
  })

  it('la comparación del segmento común ignora mayúsculas pero conserva el original', () => {
    const stores = [
      row('Local 1 - GEO Comunicaciones'),
      row('Local 2 - Geo comunicaciones'),
    ]
    expect(nombreMerchant(stores)).toBe('GEO Comunicaciones')
  })

  it('nombres de tienda vacíos o solo GOcelular no rompen', () => {
    expect(nombreMerchant([row('')])).toBeNull()
    expect(nombreMerchant([row('GOcelular.')])).toBeNull()
    expect(nombreMerchant([row('GOcelular'), row('Nebitel Shopping')])).toBe('Nebitel Shopping')
  })
})
