import { describe, it, expect } from 'vitest'
import {
  cuitValido,
  validarVenta,
  nombreComercialBase,
  candidatosStoreCliente,
  matchDeviceSku,
  elegirSkusConStock,
  type DeviceSkuCatalogo,
  PROVINCIAS_AR,
  type CatalogoVenta,
  type VentaLinea,
  type DeliveryInput,
  type StoreCatalogoRow,
} from '@/lib/wholesale-validation'

const IMEI_A = '354581531507664'
const IMEI_B = '354581531507672'
const IMEI_C = '354581531507680'
const CUIT_VALIDO = '20385096551' // verificado con el algoritmo AFIP: suma ponderada -> dv=1, coincide con el ultimo digito
const CUIT_INVALIDO = '20385096552' // mismo cuerpo, digito verificador incorrecto

const storeOk = { existe: true, activo: true, nombre: 'Distribuidora Norte SA' }

const catalogoBase: CatalogoVenta = {
  store: storeOk,
  imeisEstado: new Map([
    [IMEI_A, { status: 'available', storeId: null }],
    [IMEI_B, { status: 'consigned', storeId: 'store-1' }],
  ]),
  provincias: PROVINCIAS_AR,
}

const deliveryOk: DeliveryInput = {
  recipient_name: 'Juan Perez',
  recipient_dni: '30123456',
  recipient_phone: '+541122334455',
  recipient_email: 'juan.perez@example.com',
  street: 'Av. Siempre Viva',
  number: '742',
  floor_apartment: '4B',
  locality: 'Springfield',
  postal_code: 'C1425',
  province: 'Buenos Aires',
}

function lineaStock(gross: string, quantity = 1): VentaLinea {
  return { description: 'Producto', quantity, gross_subtotal: gross }
}

const inputStockBase = {
  proformaNumber: '123',
  storeId: 'store-1',
  consignatario: 'Distribuidora Norte SA',
  cuit: CUIT_VALIDO,
  lineas: [lineaStock('200.30', 1)],
  totalAmount: '200.30',
  imeis: [IMEI_A],
  delivery: null,
  modo: 'stock_local' as const,
}

describe('cuitValido', () => {
  it('CUIT valido real segun algoritmo AFIP', () => {
    expect(cuitValido(CUIT_VALIDO)).toBe(true)
  })

  it('CUIT invalido (digito verificador incorrecto)', () => {
    expect(cuitValido(CUIT_INVALIDO)).toBe(false)
  })

  it('CUIT con longitud incorrecta es invalido', () => {
    expect(cuitValido('2038509655')).toBe(false)
    expect(cuitValido('203850965511')).toBe(false)
  })

  it('CUIT con caracteres no numericos es invalido', () => {
    expect(cuitValido('2038509655a')).toBe(false)
  })
})

describe('validarVenta - proforma_number y CUIT', () => {
  it('pasa con proforma_number canonico y CUIT valido', () => {
    const r = validarVenta(inputStockBase, catalogoBase)
    expect(r.errores).toEqual([])
  })

  it('proforma_number con cero a la izquierda es error', () => {
    const r = validarVenta({ ...inputStockBase, proformaNumber: '0123' }, catalogoBase)
    expect(r.errores.some(e => e.includes('0123'))).toBe(true)
  })

  it('CUIT invalido en la venta es error', () => {
    const r = validarVenta({ ...inputStockBase, cuit: CUIT_INVALIDO }, catalogoBase)
    expect(r.errores.some(e => e.includes(CUIT_INVALIDO))).toBe(true)
  })
})

describe('validarVenta - store y consignatario (anti-XOXO)', () => {
  it('store inexistente es error', () => {
    const cat = { ...catalogoBase, store: { existe: false, activo: false, nombre: null } }
    const r = validarVenta(inputStockBase, cat)
    expect(r.errores.some(e => e.includes('store-1'))).toBe(true)
  })

  it('store inactivo es error', () => {
    const cat = { ...catalogoBase, store: { existe: true, activo: false, nombre: 'Distribuidora Norte SA' } }
    const r = validarVenta(inputStockBase, cat)
    expect(r.errores.some(e => e.toLowerCase().includes('inactiv'))).toBe(true)
  })

  it('consignatario que no coincide con el nombre del store es error (anti-XOXO)', () => {
    const r = validarVenta({ ...inputStockBase, consignatario: 'Otra Empresa SRL' }, catalogoBase)
    expect(r.errores.some(e => e.includes('Otra Empresa SRL'))).toBe(true)
  })

  it('consignatario matchea case-insensitive y sin tildes', () => {
    const cat = { ...catalogoBase, store: { existe: true, activo: true, nombre: 'Distribución Córdoba' } }
    const r = validarVenta({ ...inputStockBase, consignatario: '  DISTRIBUCION CORDOBA  ' }, cat)
    expect(r.errores).toEqual([])
  })

  it('consignatario matchea aunque el merchant de GOcelular lleve el sufijo " - GOcelular" (caso XOXO real)', () => {
    const cat = { ...catalogoBase, store: { existe: true, activo: true, nombre: 'XOXO TECNO - GOcelular' } }
    const r = validarVenta({ ...inputStockBase, consignatario: 'XOXO TECNO' }, cat)
    expect(r.errores).toEqual([])
  })
})

describe('nombreComercialBase', () => {
  it('quita el sufijo " - GOcelular" del merchant, normalizando', () => {
    expect(nombreComercialBase('XOXO TECNO - GOcelular')).toBe('xoxo tecno')
    expect(nombreComercialBase('XOXO TECNO')).toBe('xoxo tecno')
  })

  it('no toca un guion que no es el sufijo', () => {
    expect(nombreComercialBase('Fono - Centro')).toBe('fono - centro')
  })
})

describe('candidatosStoreCliente', () => {
  const stores: StoreCatalogoRow[] = [
    { gocuotas_store_id: '225252', store_name: 'XOXO Tecno 1', merchant_name: 'XOXO TECNO - GOcelular', is_active: true },
    { gocuotas_store_id: '229518', store_name: 'FONO Cardeñosa', merchant_name: 'XOXO TECNO - GOcelular', is_active: true },
    { gocuotas_store_id: '111111', store_name: 'Distribuidora Norte SA', merchant_name: null, is_active: true },
    { gocuotas_store_id: '222222', store_name: 'Local Viejo', merchant_name: 'XOXO TECNO - GOcelular', is_active: false },
  ]

  it('devuelve TODOS los locales activos del merchant que matchea (la ambigüedad la resuelve el usuario)', () => {
    const r = candidatosStoreCliente({ nombre_comercial: 'XOXO TECNO', razon_social: null }, stores)
    expect(r.map(s => s.gocuotas_store_id).sort()).toEqual(['225252', '229518'])
  })

  it('matchea por store_name cuando no hay merchant_name', () => {
    const r = candidatosStoreCliente({ nombre_comercial: 'distribuidora norte sa', razon_social: null }, stores)
    expect(r.map(s => s.gocuotas_store_id)).toEqual(['111111'])
  })

  it('matchea por razon_social si el nombre comercial no coincide', () => {
    const r = candidatosStoreCliente({ nombre_comercial: 'El Kiosco', razon_social: 'Distribuidora Norte SA' }, stores)
    expect(r.map(s => s.gocuotas_store_id)).toEqual(['111111'])
  })

  it('excluye locales inactivos y no matchea nombres distintos', () => {
    const r = candidatosStoreCliente({ nombre_comercial: 'Comercio Inexistente SRL', razon_social: null }, stores)
    expect(r).toEqual([])
  })

  it('cliente sin nombres utilizables no matchea nada', () => {
    const r = candidatosStoreCliente({ nombre_comercial: '  ', razon_social: null }, stores)
    expect(r).toEqual([])
  })
})

describe('matchDeviceSku', () => {
  // Nombres reales del catalogo de GOcelular (device_model_skus JOIN device_models, 3 sep 2026)
  const devices: DeviceSkuCatalogo[] = [
    { modelCode: 'SM-A075M', nombre: 'Celular Samsung Galaxy A07 4/64 GB', sku: 'SM-A075MLVAARO' },
    { modelCode: 'SM-A075M', nombre: 'Celular Samsung Galaxy A07 4/64 GB', sku: 'SM-A075MLVVARO' },
    { modelCode: 'SM-A075M (128gb)', nombre: 'Samsung Galaxy A07 4/128 GB', sku: 'SM-A075MLVWARO' },
    { modelCode: 'SM-A075M (128gb)', nombre: 'Samsung Galaxy A07 4/128 GB', sku: 'SM-A075MZGWARO' },
    { modelCode: 'SMA16', nombre: 'Samsung Galaxy A16 4/128GB', sku: 'SM-A165MLGMARO' },
    { modelCode: 'XT2535 (g06)', nombre: 'Motorola Moto G06 64gb', sku: 'PB970103AR' },
    { modelCode: 'XT2536 (g06)', nombre: 'Motorola Moto G06 4/128GB', sku: 'PB970104AR' },
  ]

  it('match exacto (case-insensitive) tiene prioridad', () => {
    const r = matchDeviceSku('Motorola Moto G06 64GB', devices)
    expect(r).toEqual({ tipo: 'match', device: devices[5] })
  })

  it('cae a normalizarModelo cuando el nombre difiere en espaciado (caso real A07 "4/128GB" vs "4/128 GB")', () => {
    const r = matchDeviceSku('Samsung Galaxy A07 4/128GB', devices)
    expect(r.tipo).toBe('match')
    if (r.tipo === 'match') expect(r.device.modelCode).toBe('SM-A075M (128gb)')
  })

  it('tolera el prefijo "Celular" del catalogo de GOcelular', () => {
    const r = matchDeviceSku('Samsung Galaxy A07 4/64GB', devices)
    expect(r.tipo).toBe('match')
    if (r.tipo === 'match') expect(r.device.modelCode).toBe('SM-A075M')
  })

  it('con match unico toma el PRIMER SKU del modelo (variantes de color comparten stock)', () => {
    const r = matchDeviceSku('Samsung Galaxy A07 4/128GB', devices)
    if (r.tipo === 'match') expect(r.device.sku).toBe('SM-A075MLVWARO')
  })

  it('normalizado que matchea mas de un model_code es ambiguo, no adivina', () => {
    const conDuplicado: DeviceSkuCatalogo[] = [
      ...devices,
      { modelCode: 'OTRO-CODE', nombre: 'Samsung Galaxy A07 128GB', sku: 'SKU-RARO' },
    ]
    const r = matchDeviceSku('Samsung Galaxy A07 4/128GB', conDuplicado)
    expect(r.tipo).toBe('ambiguo')
    if (r.tipo === 'ambiguo') expect(r.modelos).toContain('Samsung Galaxy A07 4/128 GB')
  })

  it('sin coincidencia ni exacta ni normalizada es sin_match', () => {
    expect(matchDeviceSku('iPhone 15 Pro', devices)).toEqual({ tipo: 'sin_match' })
  })
})

describe('elegirSkusConStock', () => {
  // Stock real del WH al 3/9: el A16 en color MZAMARO tenia 0 y GOcelular rechazo la venta
  const stock = new Map([
    ['SM-A165MZKMARO', 170],
    ['SM-A165MLGMARO', 15],
    ['NM2L15G', 118],
    ['NM2L15GMW', 1],
  ])

  it('elige el SKU con mas stock que cubra la cantidad (caso real A16: MZAMARO con 0 no se elige)', () => {
    const r = elegirSkusConStock(
      [{ lineRef: 'L1', producto: 'Samsung Galaxy A16 4/128GB', cantidad: 2, skus: ['SM-A165MLGMARO', 'SM-A165MZAMARO', 'SM-A165MZKMARO'] }],
      stock
    )
    expect(r.errores).toEqual([])
    expect(r.asignaciones.get('L1')).toBe('SM-A165MZKMARO')
  })

  it('un SKU con stock pero insuficiente para la cantidad no se elige (caso real Nubia: 1 disponible, pedido 2)', () => {
    const r = elegirSkusConStock(
      [{ lineRef: 'L1', producto: 'Nubia Music 2 128/4GB', cantidad: 2, skus: ['NM2L15GMW', 'NM2L15G'] }],
      stock
    )
    expect(r.asignaciones.get('L1')).toBe('NM2L15G')
  })

  it('lineas que comparten SKU descuentan del mismo pool', () => {
    const poco = new Map([['SKU-A', 3]])
    const r = elegirSkusConStock(
      [
        { lineRef: 'L1', producto: 'Modelo X', cantidad: 2, skus: ['SKU-A'] },
        { lineRef: 'L2', producto: 'Modelo X', cantidad: 2, skus: ['SKU-A'] },
      ],
      poco
    )
    expect(r.asignaciones.get('L1')).toBe('SKU-A')
    expect(r.asignaciones.has('L2')).toBe(false)
    expect(r.errores).toHaveLength(1)
    expect(r.errores[0]).toContain('SKU-A: 1')
  })

  it('sin ningun SKU que alcance, error con detalle por SKU', () => {
    const r = elegirSkusConStock(
      [{ lineRef: 'L1', producto: 'Samsung Galaxy A16 4/128GB', cantidad: 500, skus: ['SM-A165MLGMARO', 'SM-A165MZKMARO'] }],
      stock
    )
    expect(r.asignaciones.size).toBe(0)
    expect(r.errores[0]).toContain('pedido 500')
    expect(r.errores[0]).toContain('SM-A165MZKMARO: 170')
  })

  it('SKU ausente del mapa de stock cuenta como 0', () => {
    const r = elegirSkusConStock(
      [{ lineRef: 'L1', producto: 'Modelo Y', cantidad: 1, skus: ['SKU-INEXISTENTE'] }],
      stock
    )
    expect(r.errores[0]).toContain('SKU-INEXISTENTE: 0')
  })
})

describe('validarVenta - montos en centavos', () => {
  it('suma de centavos que NO cuadra con el total es error', () => {
    const input = {
      ...inputStockBase,
      lineas: [lineaStock('100.10', 1), lineaStock('100.20', 0)],
      imeis: [IMEI_A],
      totalAmount: '200.31',
    }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('total') || e.toLowerCase().includes('suma'))).toBe(true)
  })

  it('suma de centavos que SI cuadra con el total no da error de monto', () => {
    const input = {
      ...inputStockBase,
      lineas: [lineaStock('100.10', 1), lineaStock('100.20', 0)],
      imeis: [IMEI_A],
      totalAmount: '200.30',
    }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('total') || e.toLowerCase().includes('suma'))).toBe(false)
  })

  it('monto con formato invalido es error', () => {
    const input = { ...inputStockBase, totalAmount: '200,30' }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.includes('200,30'))).toBe(true)
  })

  it('total_amount superior a $500.000.000 es error', () => {
    const input = {
      ...inputStockBase,
      lineas: [lineaStock('500000000.01', 1)],
      totalAmount: '500000000.01',
    }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.includes('500.000.000'))).toBe(true)
  })
})

describe('validarVenta - stock_local IMEIs', () => {
  it('IMEI available es OK', () => {
    const r = validarVenta(inputStockBase, catalogoBase)
    expect(r.errores).toEqual([])
  })

  it('IMEI consigned en el mismo store es OK', () => {
    const input = { ...inputStockBase, imeis: [IMEI_B], lineas: [lineaStock('200.30', 1)] }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores).toEqual([])
  })

  it('IMEI consigned en OTRO store es error', () => {
    const cat = { ...catalogoBase, imeisEstado: new Map([[IMEI_B, { status: 'consigned', storeId: 'store-2' }]]) }
    const input = { ...inputStockBase, imeis: [IMEI_B] }
    const r = validarVenta(input, cat)
    expect(r.errores.some(e => e.includes(IMEI_B) && e.includes('consigned'))).toBe(true)
  })

  it('IMEI assigned es error', () => {
    const cat = { ...catalogoBase, imeisEstado: new Map([[IMEI_C, { status: 'assigned', storeId: 'store-1' }]]) }
    const input = { ...inputStockBase, imeis: [IMEI_C] }
    const r = validarVenta(input, cat)
    expect(r.errores.some(e => e.includes(IMEI_C) && e.includes('assigned'))).toBe(true)
  })

  it('IMEI inexistente en catalogo es error', () => {
    // IMEI_C es Luhn-valido pero no esta en catalogoBase.imeisEstado
    const r = validarVenta({ ...inputStockBase, imeis: [IMEI_C] }, catalogoBase)
    expect(r.errores.some(e => e.includes(IMEI_C))).toBe(true)
  })

  it('IMEI con digito verificador Luhn invalido es error', () => {
    const input = { ...inputStockBase, imeis: ['123456789012345'], lineas: [lineaStock('200.30', 1)] }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.includes('123456789012345'))).toBe(true)
  })

  it('IMEI duplicado en la lista es error', () => {
    const input = { ...inputStockBase, imeis: [IMEI_A, IMEI_A] }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('duplicado'))).toBe(true)
  })

  it('mas de 500 imeis es error', () => {
    const imeis = Array.from({ length: 501 }, () => IMEI_A)
    const input = { ...inputStockBase, imeis }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.includes('500'))).toBe(true)
  })

  it('suma de quantity distinta a la cantidad de imeis es error', () => {
    const input = {
      ...inputStockBase,
      lineas: [lineaStock('200.30', 3)],
      imeis: [IMEI_A],
    }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('quantity') || e.toLowerCase().includes('cantidad'))).toBe(true)
  })

  it('stock_local sin imeis (null) es error', () => {
    const input = { ...inputStockBase, imeis: null }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('imei'))).toBe(true)
  })
})

describe('validarVenta - andreani_wh', () => {
  const inputAndreani = {
    proformaNumber: '456',
    storeId: 'store-1',
    consignatario: 'Distribuidora Norte SA',
    cuit: CUIT_VALIDO,
    lineas: [lineaStock('200.30', 2)],
    totalAmount: '200.30',
    imeis: null,
    delivery: deliveryOk,
    modo: 'andreani_wh' as const,
  }

  it('pasa con delivery completo y sin imeis', () => {
    const r = validarVenta(inputAndreani, catalogoBase)
    expect(r.errores).toEqual([])
  })

  it('imeis presentes en modo andreani_wh es error', () => {
    const r = validarVenta({ ...inputAndreani, imeis: [IMEI_A] }, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('imei'))).toBe(true)
  })

  it('delivery null en modo andreani_wh es error', () => {
    const r = validarVenta({ ...inputAndreani, delivery: null }, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('delivery'))).toBe(true)
  })

  it('delivery incompleto (falta street) es error', () => {
    const delivery = { ...deliveryOk, street: '' }
    const r = validarVenta({ ...inputAndreani, delivery }, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('street'))).toBe(true)
  })

  it('recipient_dni de 6 digitos es error', () => {
    const delivery = { ...deliveryOk, recipient_dni: '123456' }
    const r = validarVenta({ ...inputAndreani, delivery }, catalogoBase)
    expect(r.errores.some(e => e.includes('123456'))).toBe(true)
  })

  it('provincia invalida es error', () => {
    const delivery = { ...deliveryOk, province: 'Narnia' }
    const r = validarVenta({ ...inputAndreani, delivery }, catalogoBase)
    expect(r.errores.some(e => e.includes('Narnia'))).toBe(true)
  })

  it('provincia matchea case-insensitive y sin tildes', () => {
    const delivery = { ...deliveryOk, province: 'cordoba' }
    const r = validarVenta({ ...inputAndreani, delivery }, catalogoBase)
    expect(r.errores.some(e => e.includes('cordoba'))).toBe(false)
  })

  it('mas de 500 unidades totales es error', () => {
    const input = { ...inputAndreani, lineas: [lineaStock('200.30', 501)] }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.includes('500'))).toBe(true)
  })

  it('linea con gross_subtotal superior a $100.000.000 es error (tope por linea)', () => {
    const input = { ...inputAndreani, lineas: [lineaStock('100000000.01', 1)], totalAmount: '100000000.01' }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.includes('100.000.000'))).toBe(true)
  })

  it('recipient_name de 50 caracteres da warning (GOcelular trunca) pero no error', () => {
    const delivery = { ...deliveryOk, recipient_name: 'a'.repeat(50) }
    const r = validarVenta({ ...inputAndreani, delivery }, catalogoBase)
    expect(r.errores).toEqual([])
    expect(r.warnings.some(w => w.toLowerCase().includes('recipient_name') || w.toLowerCase().includes('trunca'))).toBe(true)
  })

  it('recipient_name de 101 caracteres es error (supera el maximo)', () => {
    const delivery = { ...deliveryOk, recipient_name: 'a'.repeat(101) }
    const r = validarVenta({ ...inputAndreani, delivery }, catalogoBase)
    expect(r.errores.some(e => e.toLowerCase().includes('recipient_name'))).toBe(true)
  })

  it('recipient_phone con formato invalido es error', () => {
    const delivery = { ...deliveryOk, recipient_phone: '11-2233-4455' }
    const r = validarVenta({ ...inputAndreani, delivery }, catalogoBase)
    expect(r.errores.some(e => e.includes('11-2233-4455'))).toBe(true)
  })

  it('recipient_email con formato invalido es error', () => {
    const delivery = { ...deliveryOk, recipient_email: 'no-es-email' }
    const r = validarVenta({ ...inputAndreani, delivery }, catalogoBase)
    expect(r.errores.some(e => e.includes('no-es-email'))).toBe(true)
  })
})

describe('validarVenta - junta todos los errores en una pasada', () => {
  it('no corta en el primer error', () => {
    const input = {
      ...inputStockBase,
      proformaNumber: '00',
      cuit: CUIT_INVALIDO,
      totalAmount: '999,99',
    }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.length).toBeGreaterThanOrEqual(3)
  })
})

describe('validarVenta - boundaries', () => {
  it('total_amount exactamente $500.000.000 NO es error de tope', () => {
    const input = {
      ...inputStockBase,
      lineas: [lineaStock('500000000.00', 1)],
      totalAmount: '500000000.00',
    }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.includes('500.000.000'))).toBe(false)
  })

  it('linea andreani_wh exactamente $100.000.000 NO es error de tope por linea', () => {
    const input = {
      proformaNumber: '456',
      storeId: 'store-1',
      consignatario: 'Distribuidora Norte SA',
      cuit: CUIT_VALIDO,
      lineas: [lineaStock('100000000.00', 1)],
      totalAmount: '100000000.00',
      imeis: null,
      delivery: deliveryOk,
      modo: 'andreani_wh' as const,
    }
    const r = validarVenta(input, catalogoBase)
    expect(r.errores.some(e => e.includes('100.000.000'))).toBe(false)
  })

  it('exactamente 500 imeis en stock_local NO es error de tope', () => {
    const unicos = Array.from({ length: 500 }, (_, i) => generarImeiLuhn(i))
    const cat: CatalogoVenta = {
      ...catalogoBase,
      imeisEstado: new Map(unicos.map(imei => [imei, { status: 'available' as const, storeId: null }])),
    }
    const r = validarVenta({ ...inputStockBase, imeis: unicos, lineas: [lineaStock('200.30', 500)] }, cat)
    expect(r.errores.some(e => e.includes('500') && e.toLowerCase().includes('máximo'))).toBe(false)
  })

  function generarImeiLuhn(i: number): string {
    // Genera un IMEI de 15 digitos Luhn-valido variando el ultimo digito.
    const base = (354581531500000 + i).toString().padStart(14, '0').slice(-14)
    for (let d = 0; d <= 9; d++) {
      const candidate = base + String(d)
      let sum = 0
      for (let k = 0; k < 15; k++) {
        let val = Number(candidate[k])
        if (k % 2 === 1) {
          val *= 2
          if (val > 9) val -= 9
        }
        sum += val
      }
      if (sum % 10 === 0) return candidate
    }
    throw new Error('no valid luhn candidate found')
  }
})

describe('PROVINCIAS_AR', () => {
  it('tiene las 24 jurisdicciones', () => {
    expect(PROVINCIAS_AR.length).toBe(24)
    expect(PROVINCIAS_AR).toContain('Buenos Aires')
    expect(PROVINCIAS_AR).toContain('CABA')
    expect(PROVINCIAS_AR).toContain('Córdoba')
    expect(PROVINCIAS_AR).toContain('Santa Fe')
    expect(PROVINCIAS_AR).toContain('Tucumán')
  })
})
