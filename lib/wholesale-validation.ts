import { luhnValido } from '@/lib/imei-excel-parser'

export interface VentaLinea {
  description: string
  quantity: number
  gross_subtotal: string
}

export interface CatalogoVenta {
  store: { existe: boolean; activo: boolean; nombre: string | null }
  imeisEstado: Map<string, { status: string; storeId: string | null }>
  provincias: string[]
}

export interface DeliveryInput {
  recipient_name: string
  recipient_dni: string
  recipient_phone: string
  recipient_email: string
  street: string
  number: string
  floor_apartment?: string
  locality: string
  postal_code: string
  province: string
}

export interface VentaInput {
  proformaNumber: string
  storeId: string
  consignatario: string
  cuit: string
  lineas: VentaLinea[]
  totalAmount: string
  imeis: string[] | null
  delivery: DeliveryInput | null
  modo: 'stock_local' | 'andreani_wh'
}

export interface ValidacionVentaResult {
  errores: string[]
  warnings: string[]
}

// Las 24 jurisdicciones argentinas (23 provincias + CABA), usadas como fallback
// cuando el catalogo pasado a validarVenta no trae la lista propia.
export const PROVINCIAS_AR: string[] = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
]

const MONTO_RE = /^\d+(\.\d{1,2})?$/
const PROFORMA_NUMBER_RE = /^[1-9][0-9]*$/
const CUIT_RE = /^\d{11}$/
const DNI_RE = /^\d{7,8}$/
const POSTAL_CODE_RE = /^[A-Za-z0-9]{4,8}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const TOPE_TOTAL_CENTAVOS = 500_000_000 * 100
const TOPE_LINEA_ANDREANI_CENTAVOS = 100_000_000 * 100
const MAX_UNIDADES = 500

const aCentavos = (s: string): number => Math.round(parseFloat(s) * 100)

const formatoMonto = (centavos: number): string =>
  (centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Normaliza texto para comparaciones: minusculas, sin tildes, trim. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Valida un CUIT argentino: 11 digitos + digito verificador AFIP
 * (pesos [5,4,3,2,7,6,5,4,3,2], mod 11).
 */
export function cuitValido(cuit: string): boolean {
  if (!CUIT_RE.test(cuit)) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const digitos = cuit.split('').map(Number)
  let suma = 0
  for (let i = 0; i < 10; i++) suma += digitos[i] * pesos[i]
  let dv = 11 - (suma % 11)
  if (dv === 11) dv = 0
  return dv !== 10 && dv === digitos[10]
}

/**
 * Pre-validacion pura de una venta mayorista contra las reglas de GOcelular.
 * No hace I/O: recibe el catalogo (store, imeis, provincias) ya resuelto por el caller.
 * Junta TODOS los errores en una pasada (no corta en el primero).
 */
export function validarVenta(input: VentaInput, catalogo: CatalogoVenta): ValidacionVentaResult {
  const errores: string[] = []
  const warnings: string[] = []

  // --- proforma_number canonico ---
  if (!PROFORMA_NUMBER_RE.test(input.proformaNumber)) {
    errores.push(`El número de proforma "${input.proformaNumber}" no tiene el formato canónico esperado (entero positivo sin ceros a la izquierda)`)
  }

  // --- CUIT ---
  if (!cuitValido(input.cuit)) {
    errores.push(`El CUIT "${input.cuit}" no es válido (falla la verificación de dígito verificador AFIP)`)
  }

  // --- store + consignatario (anti-XOXO) ---
  if (!catalogo.store.existe) {
    errores.push(`El store "${input.storeId}" no existe en GOcelular`)
  } else if (!catalogo.store.activo) {
    errores.push(`El store "${input.storeId}" existe en GOcelular pero está inactivo`)
  } else if (catalogo.store.nombre !== null && normalizar(catalogo.store.nombre) !== normalizar(input.consignatario)) {
    errores.push(
      `El consignatario "${input.consignatario}" no coincide con el nombre del store en GOcelular ("${catalogo.store.nombre}") — posible venta cruzada entre stores (anti-XOXO)`
    )
  }

  // --- montos: formato + suma en centavos + topes ---
  let sumaCentavos = 0
  let algunMontoConFormatoInvalido = false
  let unidadesTotales = 0

  for (const linea of input.lineas) {
    unidadesTotales += linea.quantity

    if (!MONTO_RE.test(linea.gross_subtotal)) {
      errores.push(`Línea "${linea.description}": el monto "${linea.gross_subtotal}" no tiene el formato requerido (decimal con punto, ej. 185000.00)`)
      algunMontoConFormatoInvalido = true
      continue
    }

    const centavosLinea = aCentavos(linea.gross_subtotal)
    sumaCentavos += centavosLinea

    if (input.modo === 'andreani_wh' && centavosLinea > TOPE_LINEA_ANDREANI_CENTAVOS) {
      errores.push(`Línea "${linea.description}": el monto $${linea.gross_subtotal} supera el tope de $100.000.000 por línea (modo andreani_wh)`)
    }
  }

  if (!MONTO_RE.test(input.totalAmount)) {
    errores.push(`El monto total "${input.totalAmount}" no tiene el formato requerido (decimal con punto, ej. 185000.00)`)
  } else {
    const totalCentavos = aCentavos(input.totalAmount)

    if (!algunMontoConFormatoInvalido && totalCentavos !== sumaCentavos) {
      errores.push(
        `El total_amount declarado ($${input.totalAmount}) no coincide con la suma de gross_subtotal de las líneas ($${formatoMonto(sumaCentavos)})`
      )
    }

    if (totalCentavos > TOPE_TOTAL_CENTAVOS) {
      errores.push(`El total_amount ($${input.totalAmount}) supera el tope de $500.000.000`)
    }
  }

  // --- reglas por modo ---
  if (input.modo === 'stock_local') {
    validarImeisStockLocal(input, catalogo, errores)
  } else {
    validarAndreaniWh(input, unidadesTotales, catalogo, errores, warnings)
  }

  return { errores, warnings }
}

function validarImeisStockLocal(input: VentaInput, catalogo: CatalogoVenta, errores: string[]): void {
  if (input.imeis === null) {
    errores.push('El modo stock_local requiere una lista de imeis (vino null)')
    return
  }

  const imeis = input.imeis

  if (imeis.length === 0) {
    errores.push('La venta stock_local no tiene ningún imei (mínimo 1)')
  }
  if (imeis.length > MAX_UNIDADES) {
    errores.push(`La venta tiene ${imeis.length} imeis y el máximo es ${MAX_UNIDADES}`)
  }

  const vistos = new Set<string>()
  for (const imei of imeis) {
    if (vistos.has(imei)) {
      errores.push(`IMEI duplicado en la venta: ${imei}`)
      continue
    }
    vistos.add(imei)

    if (!luhnValido(imei)) {
      errores.push(`IMEI con dígito verificador inválido: ${imei}`)
      continue
    }

    const estado = catalogo.imeisEstado.get(imei)
    if (!estado) {
      errores.push(`El IMEI ${imei} no existe en el catálogo de GOcelular`)
    } else if (estado.status === 'available') {
      // ok
    } else if (estado.status === 'consigned' && estado.storeId === input.storeId) {
      // ok
    } else {
      errores.push(`El IMEI ${imei} no está disponible para la venta (estado: ${estado.status})`)
    }
  }

  const sumaQuantity = input.lineas.reduce((acc, l) => acc + l.quantity, 0)
  if (sumaQuantity !== imeis.length) {
    errores.push(`La suma de quantity de las líneas (${sumaQuantity}) no coincide con la cantidad de imeis (${imeis.length})`)
  }
}

function validarAndreaniWh(
  input: VentaInput,
  unidadesTotales: number,
  catalogo: CatalogoVenta,
  errores: string[],
  warnings: string[]
): void {
  if (input.imeis !== null) {
    errores.push('El modo andreani_wh no admite imeis (deben ir null) — el fulfillment lo resuelve el warehouse de Andreani')
  }

  if (unidadesTotales > MAX_UNIDADES) {
    errores.push(`La venta tiene ${unidadesTotales} unidades y el máximo es ${MAX_UNIDADES} (modo andreani_wh)`)
  }

  if (input.delivery === null) {
    errores.push('El modo andreani_wh requiere datos de delivery (vino null)')
    return
  }

  validarDelivery(input.delivery, catalogo, errores, warnings)
}

function validarDelivery(delivery: DeliveryInput, catalogo: CatalogoVenta, errores: string[], warnings: string[]): void {
  const requerido = (valor: string | undefined, campo: string): boolean => {
    if (!valor || valor.trim() === '') {
      errores.push(`El campo de delivery "${campo}" es obligatorio`)
      return false
    }
    return true
  }

  if (requerido(delivery.recipient_name, 'recipient_name')) {
    if (delivery.recipient_name.length > 100) {
      errores.push(`El campo "recipient_name" ("${delivery.recipient_name}") supera el máximo de 100 caracteres`)
    } else if (delivery.recipient_name.length > 45) {
      warnings.push(`El campo "recipient_name" supera los 45 caracteres — GOcelular lo trunca y avisa`)
    }
  }

  if (requerido(delivery.recipient_dni, 'recipient_dni') && !DNI_RE.test(delivery.recipient_dni)) {
    errores.push(`El campo "recipient_dni" ("${delivery.recipient_dni}") debe tener 7-8 dígitos`)
  }

  if (requerido(delivery.recipient_phone, 'recipient_phone')) {
    const m = /^\+?(\d+)$/.exec(delivery.recipient_phone)
    if (!m || m[1].length > 20) {
      errores.push(`El campo "recipient_phone" ("${delivery.recipient_phone}") debe ser numérico (con "+" opcional al inicio) de hasta 20 dígitos`)
    }
  }

  if (requerido(delivery.recipient_email, 'recipient_email')) {
    if (delivery.recipient_email.length > 128) {
      errores.push(`El campo "recipient_email" ("${delivery.recipient_email}") supera el máximo de 128 caracteres`)
    } else if (!EMAIL_RE.test(delivery.recipient_email)) {
      errores.push(`El campo "recipient_email" ("${delivery.recipient_email}") no es un email válido`)
    }
  }

  if (requerido(delivery.street, 'street') && delivery.street.length > 128) {
    errores.push(`El campo "street" supera el máximo de 128 caracteres`)
  }

  if (requerido(delivery.number, 'number') && delivery.number.length > 16) {
    errores.push(`El campo "number" supera el máximo de 16 caracteres`)
  }

  if (delivery.floor_apartment !== undefined && delivery.floor_apartment.length > 32) {
    errores.push(`El campo "floor_apartment" supera el máximo de 32 caracteres`)
  }

  if (requerido(delivery.locality, 'locality') && delivery.locality.length > 64) {
    errores.push(`El campo "locality" supera el máximo de 64 caracteres`)
  }

  if (requerido(delivery.postal_code, 'postal_code') && !POSTAL_CODE_RE.test(delivery.postal_code)) {
    errores.push(`El campo "postal_code" ("${delivery.postal_code}") debe ser alfanumérico de 4-8 caracteres`)
  }

  if (requerido(delivery.province, 'province')) {
    if (delivery.province.length > 64) {
      errores.push(`El campo "province" supera el máximo de 64 caracteres`)
    } else {
      const provincias = catalogo.provincias.length > 0 ? catalogo.provincias : PROVINCIAS_AR
      const needle = normalizar(delivery.province)
      const matchea = provincias.some(p => normalizar(p) === needle)
      if (!matchea) {
        errores.push(`La provincia "${delivery.province}" no está en el catálogo de jurisdicciones argentinas`)
      }
    }
  }
}
