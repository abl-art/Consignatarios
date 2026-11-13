// EAN-13 provisorio para productos sin EAN real (pedido de Pedro 13/11/2026):
// al informar una compra que no es un celular (addons de GOcelular o cualquier
// producto de GOmarket) sin EAN cargado, se manda uno inventado para que
// GOcelular pueda dar de alta el producto en Andreani y crear la ASN.
//
// Prefijo 299: rango GS1 de uso interno (es el mismo que ya usa Pedro cuando
// asigna provisorios a mano). El cuerpo sale de un hash del SKU, así el mismo
// SKU genera SIEMPRE el mismo EAN — reintentos y reenvíos con otra
// purchase_reference no duplican el alta del producto en Andreani.

import crypto from 'node:crypto'

/** Dígito verificador EAN-13 sobre los primeros 12 dígitos */
export function digitoVerificadorEan(doce: string): number {
  let suma = 0
  for (let i = 0; i < 12; i++) {
    suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (suma % 10)) % 10
}

export function esEan13Valido(ean: string): boolean {
  if (!/^\d{13}$/.test(ean)) return false
  return Number(ean[12]) === digitoVerificadorEan(ean.slice(0, 12))
}

/** EAN-13 provisorio determinístico: 299 + 9 dígitos del hash del SKU + verificador */
export function eanProvisorio(sku: string): string {
  const hash = crypto.createHash('sha256').update(sku.trim().toUpperCase()).digest('hex')
  // 9 dígitos decimales estables: 48 bits del hash (entero seguro en JS) módulo 1e9
  const cuerpo = (parseInt(hash.slice(0, 12), 16) % 1_000_000_000).toString().padStart(9, '0')
  const doce = `299${cuerpo}`
  return doce + String(digitoVerificadorEan(doce))
}
