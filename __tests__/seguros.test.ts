import { describe, it, expect } from 'vitest'
import { normalizarModelo } from '@/lib/inventario-indicadores'
import {
  normalizarDni,
  sumarMeses,
  armarDomicilio,
  prepararCertificados,
  novedadesDeCertificados,
  type VentaAsegurable,
  type CertActual,
} from '@/lib/seguros'

function venta(over: Partial<VentaAsegurable> = {}): VentaAsegurable {
  return {
    gocuotasOrderId: 'go-1',
    storeOrderId: 'store-1',
    pedidoNumero: 'PED-1',
    linkedAt: '2026-10-01T00:00:00Z',
    orderCreatedAt: '2026-10-28T09:00:00Z',
    imei: '350000000000001',
    dni: '12345678',
    cliente: 'Juan Perez',
    shippingStreet: 'Calle Falsa',
    shippingNumber: '123',
    shippingFloor: null,
    shippingApartment: null,
    branchAddress: null,
    cp: '1000',
    localidad: 'CABA',
    articulo: 'Motorola Moto G06 4/64GB',
    ...over,
  }
}

function cert(over: Partial<CertActual> = {}): CertActual {
  return {
    id: 'cert-1',
    gocuotasOrderId: 'go-1',
    imei: '350000000000001',
    fechaAnula: null,
    fechaSiniestro: null,
    ...over,
  }
}

const ACTIVADO_AT = '2026-10-01T00:00:00Z'

describe('normalizarDni', () => {
  it('deja solo dígitos, recorta espacios', () => {
    expect(normalizarDni('12.345.678 ')).toBe('12345678')
  })

  it('quita ceros a la izquierda', () => {
    expect(normalizarDni('012345678')).toBe('12345678')
  })
})

describe('sumarMeses', () => {
  it('suma meses dentro del mismo día del mes', () => {
    expect(sumarMeses('2026-10-28', 9)).toBe('2027-07-28')
  })

  it('clampea a fin de mes, no rueda al mes siguiente', () => {
    expect(sumarMeses('2026-05-31', 9)).toBe('2027-02-28')
  })
})

describe('armarDomicilio', () => {
  it('calle + número cuando no hay piso/depto', () => {
    expect(armarDomicilio(venta())).toBe('Calle Falsa 123')
  })

  it('agrega piso y depto cuando están presentes', () => {
    expect(armarDomicilio(venta({ shippingFloor: '4', shippingApartment: 'B' }))).toBe(
      'Calle Falsa 123, Piso 4, Depto B',
    )
  })

  it('agrega solo piso cuando no hay depto', () => {
    expect(armarDomicilio(venta({ shippingFloor: '4' }))).toBe('Calle Falsa 123, Piso 4')
  })

  it('retiro en sucursal (sin calle) usa branchAddress', () => {
    expect(
      armarDomicilio(venta({ shippingStreet: null, shippingNumber: null, branchAddress: 'Av. X 123' })),
    ).toBe('Av. X 123')
  })
})

describe('prepararCertificados', () => {
  it('con clave en costosPorClave: costoSinIva, sumaAsegurada +10%, fuente lista, emitido, finVig a 9 meses', () => {
    const key = normalizarModelo('Motorola Moto G06 4/64GB')
    const [c] = prepararCertificados(
      [venta()],
      new Set(),
      new Map([[key, 242000]]),
      new Map(),
      ACTIVADO_AT,
    )
    expect(c.costoSinIva).toBe(242000)
    expect(c.sumaAsegurada).toBe(266200)
    expect(c.costoFuente).toBe('lista')
    expect(c.estado).toBe('emitido')
    expect(c.finVig).toBe('2027-07-28')
  })

  it('sin costo de lista pero con costo por imei: suma +10%, fuente inventario', () => {
    const [c] = prepararCertificados(
      [venta()],
      new Set(),
      new Map(),
      new Map([['350000000000001', 200000]]),
      ACTIVADO_AT,
    )
    expect(c.costoSinIva).toBe(200000)
    expect(c.sumaAsegurada).toBe(220000)
    expect(c.costoFuente).toBe('inventario')
    expect(c.estado).toBe('emitido')
  })

  it('sin ningún costo: sumaAsegurada null, estado pendiente', () => {
    const [c] = prepararCertificados([venta()], new Set(), new Map(), new Map(), ACTIVADO_AT)
    expect(c.costoSinIva).toBeNull()
    expect(c.sumaAsegurada).toBeNull()
    expect(c.costoFuente).toBeNull()
    expect(c.estado).toBe('pendiente')
  })

  it('linkedAt anterior a activadoAt: no genera certificado', () => {
    const certs = prepararCertificados(
      [venta({ linkedAt: '2026-09-01T00:00:00Z' })],
      new Set(),
      new Map(),
      new Map(),
      ACTIVADO_AT,
    )
    expect(certs).toHaveLength(0)
  })

  it('linkedAt exactamente igual a activadoAt: SÍ genera certificado (>=)', () => {
    const certs = prepararCertificados(
      [venta({ linkedAt: ACTIVADO_AT })],
      new Set(),
      new Map(),
      new Map(),
      ACTIVADO_AT,
    )
    expect(certs).toHaveLength(1)
  })

  it('orden ya existente en ordenesExistentes: no genera (idempotencia)', () => {
    const certs = prepararCertificados(
      [venta()],
      new Set(['go-1']),
      new Map(),
      new Map(),
      ACTIVADO_AT,
    )
    expect(certs).toHaveLength(0)
  })

  it('retiro en sucursal: domicilio = branchAddress', () => {
    const [c] = prepararCertificados(
      [venta({ shippingStreet: null, shippingNumber: null, branchAddress: 'Av. X 123' })],
      new Set(),
      new Map(),
      new Map(),
      ACTIVADO_AT,
    )
    expect(c.domicilio).toBe('Av. X 123')
  })

  it('linkedAt formato pg (espacio) posterior a activadoAt ISO (T) el mismo día: SÍ genera certificado', () => {
    // Regresión: comparar como string haría ' ' (0x20) < 'T' (0x54) y perdería
    // en silencio toda venta vinculada el mismo día de la activación.
    const certs = prepararCertificados(
      [venta({ linkedAt: '2026-10-28 15:02:13.064+00' })],
      new Set(),
      new Map(),
      new Map(),
      '2026-10-28T12:00:00+00:00',
    )
    expect(certs).toHaveLength(1)
  })

  it('linkedAt formato pg (espacio) anterior a activadoAt ISO (T) el mismo día: NO genera certificado', () => {
    const certs = prepararCertificados(
      [venta({ linkedAt: '2026-10-28 09:00:00.000+00' })],
      new Set(),
      new Map(),
      new Map(),
      '2026-10-28T12:00:00+00:00',
    )
    expect(certs).toHaveLength(0)
  })

  it('venta sin DNI: dni queda null, el resto del certificado se genera igual', () => {
    const [c] = prepararCertificados(
      [venta({ dni: null })],
      new Set(),
      new Map(),
      new Map(),
      ACTIVADO_AT,
    )
    expect(c.dni).toBeNull()
    expect(c.imei).toBe('350000000000001')
  })
})

describe('novedadesDeCertificados', () => {
  it('imei actual distinto al del cert: novedad { imei }, nunca un cert nuevo', () => {
    const novedades = novedadesDeCertificados(
      [cert()],
      new Map([['go-1', '999999999999999']]),
      new Map(),
      new Map(),
    )
    expect(novedades).toEqual([{ id: 'cert-1', imei: '999999999999999' }])
  })

  it('orden descartada: { fechaAnula, motivoAnula: descartada }', () => {
    const novedades = novedadesDeCertificados(
      [cert()],
      new Map(),
      new Map([['go-1', '2026-09-01']]),
      new Map(),
    )
    expect(novedades).toEqual([{ id: 'cert-1', fechaAnula: '2026-09-01', motivoAnula: 'descartada' }])
  })

  it('descartada y con contracargo: gana la fecha más temprana (contracargo antes)', () => {
    const novedades = novedadesDeCertificados(
      [cert()],
      new Map(),
      new Map([['go-1', '2026-09-10']]),
      new Map([['go-1', '2026-09-05']]),
    )
    expect(novedades).toEqual([{ id: 'cert-1', fechaAnula: '2026-09-05', motivoAnula: 'contracargo' }])
  })

  it('descartada y con contracargo: gana la fecha más temprana (descartada antes)', () => {
    const novedades = novedadesDeCertificados(
      [cert()],
      new Map(),
      new Map([['go-1', '2026-09-02']]),
      new Map([['go-1', '2026-09-10']]),
    )
    expect(novedades).toEqual([{ id: 'cert-1', fechaAnula: '2026-09-02', motivoAnula: 'descartada' }])
  })

  it('cert ya anulado: sin novedades, no se pisa', () => {
    const novedades = novedadesDeCertificados(
      [cert({ fechaAnula: '2026-08-01' })],
      new Map([['go-1', '999999999999999']]),
      new Map([['go-1', '2026-09-01']]),
      new Map(),
    )
    expect(novedades).toEqual([])
  })

  it('cert con fechaSiniestro: sin novedades, no se pisa', () => {
    const novedades = novedadesDeCertificados(
      [cert({ fechaSiniestro: '2026-08-01' })],
      new Map([['go-1', '999999999999999']]),
      new Map([['go-1', '2026-09-01']]),
      new Map(),
    )
    expect(novedades).toEqual([])
  })

  it('sin cambios: []', () => {
    const novedades = novedadesDeCertificados([cert()], new Map(), new Map(), new Map())
    expect(novedades).toEqual([])
  })
})
