// Cálculo del stock de accesorios por depósito para /inventario/stock.
//
// "ASN aceptado" NO significa recibido: Andreani acepta el aviso y la
// recepción física llega después (received_quantity en los intake items).
// Los ASN manuales viejos (ago 4) no tienen intake items vinculados, así que
// lo informado sale del payload y se le resta lo aceptado-pero-no-recibido.
// Igual que con celulares, lo en tránsito no cuenta en ningún depósito ni
// suma al total.

export interface StockAccesorioInput {
  stock: number // store_products.stock (total GOcelular)
  informadas: number // cantidadPedida sumada de ASN aceptados (payload)
  pendientesAceptadas: number // quantity - received de intake items con ASN aceptado
  despachadas: number // despachos desde Andreani (pedidos aceptados)
  enTransito: number // quantity - received de todos los intake items
}

export interface StockAccesorioResult {
  whAndreani: number
  whGocuotas: number
  total: number
}

export function calcularStockAccesorio(i: StockAccesorioInput): StockAccesorioResult {
  // Tope: lo en tránsito integra el stock pero no está en ningún depósito
  const whAndreani = Math.min(
    Math.max(0, i.informadas - i.pendientesAceptadas - i.despachadas),
    Math.max(0, i.stock - i.enTransito)
  )
  const whGocuotas = Math.max(0, i.stock - whAndreani - i.enTransito)
  return { whAndreani, whGocuotas, total: whAndreani + whGocuotas }
}
