import { describe, it, expect } from 'vitest'
import {
  formatearPesos,
  mapearProductosTienda,
  armarLineasPrecios,
  type CatalogoProducto,
} from '@/lib/gocelular-prices'
import type { FilaListaPrecios } from '@/lib/lista-precios'

function fila(over: Partial<FilaListaPrecios> = {}): FilaListaPrecios {
  return {
    productoId: 'p1',
    nombre: 'Samsung Galaxy A27 5G 256GB',
    codigo: 'SM-A27 (256gb)',
    marca: 'Samsung',
    proveedor: 'IATEC SAU (Mirgor sa)',
    proveedorPreferido: true,
    costo: 500000,
    multiplo: 2,
    pvp: 1139400,
    cuota: 126600,
    mup: 1.88,
    mupPesos: 441735,
    precioTienda: 1205100,
    diferencia: 65700,
    ventas30d: 10,
    fijado: false,
    bonoMonto: null,
    bonoDesde: null,
    bonoHasta: null,
    bonoCupo: null,
    bonoVendidas: null,
    bonoEstado: null,
    pvpConBono: null,
    cuotaConBono: null,
    ncEsperada: null,
    ...over,
  }
}

function catalogo(over: Partial<CatalogoProducto> = {}): CatalogoProducto {
  return {
    store_product_id: 'f496800e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
    slug: 'samsung-galaxy-a27-5g-256gb',
    display_name: 'Samsung Galaxy A27 5G 256GB',
    brand: 'Samsung',
    model_code: 'SM-A27 (256gb)',
    skus: ['SM-A276BZKGARO'],
    status: 'active',
    price: '1205100.00',
    compare_at_price: null,
    reference_installments: 9,
    installment: '133900.00',
    headroom: 4,
    ...over,
  }
}

describe('formatearPesos', () => {
  it('formatea a string decimal con 2 decimales sin separador de miles', () => {
    expect(formatearPesos(1205100)).toBe('1205100.00')
    expect(formatearPesos(899100.5)).toBe('899100.50')
  })

  it('redondea a 2 decimales sin arrastre de coma flotante', () => {
    expect(formatearPesos(0.1 + 0.2)).toBe('0.30')
  })
})

describe('mapearProductosTienda', () => {
  it('matchea primero por codigo == model_code', () => {
    const r = mapearProductosTienda([fila()], [catalogo({ display_name: 'Otro Nombre Cualquiera' })])
    expect(r.mapeadas).toHaveLength(1)
    expect(r.mapeadas[0].producto.store_product_id).toBe('f496800e-1c2d-4e5f-8a9b-0c1d2e3f4a5b')
    expect(r.sinMapear).toHaveLength(0)
  })

  it('sin codigo cae al nombre normalizado (tolera prefijo Celular y RAM)', () => {
    const r = mapearProductosTienda(
      [fila({ codigo: null, nombre: 'Samsung Galaxy A17 4/128GB' })],
      [catalogo({ model_code: 'XX', display_name: 'Celular Samsung Galaxy A17 4/128 GB' })],
    )
    expect(r.mapeadas).toHaveLength(1)
  })

  it('un modelo sin match queda en sinMapear', () => {
    const r = mapearProductosTienda(
      [fila({ codigo: 'NO-EXISTE', nombre: 'Nubia Air 256GB' })],
      [catalogo()],
    )
    expect(r.mapeadas).toHaveLength(0)
    expect(r.sinMapear.map(f => f.nombre)).toEqual(['Nubia Air 256GB'])
  })

  it('dos filas no pueden mapear al mismo producto de tienda: la segunda queda sinMapear', () => {
    const r = mapearProductosTienda(
      [fila(), fila({ productoId: 'p2', nombre: 'Samsung Galaxy A27 5G 256GB v2' , codigo: 'SM-A27 (256gb)' })],
      [catalogo()],
    )
    expect(r.mapeadas).toHaveLength(1)
    expect(r.sinMapear).toHaveLength(1)
  })
})

describe('armarLineasPrecios', () => {
  it('arma la línea con expected_* del catálogo y new_price = PVP vigente', () => {
    const { lineas } = armarLineasPrecios([{ fila: fila(), producto: catalogo() }])
    expect(lineas).toEqual([
      {
        store_product_id: 'f496800e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
        expected_slug: 'samsung-galaxy-a27-5g-256gb',
        expected_price: '1205100.00',
        new_price: '1139400.00',
      },
    ])
  })

  it('con bono vigente el new_price es el PVP con bono', () => {
    const { lineas } = armarLineasPrecios([
      { fila: fila({ pvpConBono: 1089000 }), producto: catalogo() },
    ])
    expect(lineas[0].new_price).toBe('1089000.00')
  })

  it('una fila sin PVP calculable queda excluida y reportada', () => {
    const { lineas, excluidas } = armarLineasPrecios([
      { fila: fila({ pvp: null, costo: null }), producto: catalogo() },
    ])
    expect(lineas).toHaveLength(0)
    expect(excluidas.map(f => f.nombre)).toEqual(['Samsung Galaxy A27 5G 256GB'])
  })
})
