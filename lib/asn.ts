// Armado del listado de ASN (abastecimientos a Andreani) para la pestaña
// ASN de /compras/envios. Módulo puro compartible server/client.

export interface AsnTransaccion {
  id: string
  id_transaccion: string
  numero_orden_externa: string
  estado: string // accepted | rejected | sending
  fecha: string // YYYY-MM-DD
}

export interface AsnCelularRow {
  asn_transaction_id: string
  modelo: string
  unidades: number
  en_transito: number
}

export interface AsnAccesorioRow {
  asn_transaction_id: string
  sku: string
  cantidad: number
  recibidas: number
}

export interface AsnItem {
  tipo: 'celular' | 'accesorio'
  descripcion: string
  cantidad: number
  ingresadas: number
}

export interface AsnResumen {
  id: string
  id_transaccion: string
  orden: string
  estado: string
  fecha: string
  totalUnidades: number
  ingresadas: number
  pendientes: number
  items: AsnItem[]
}

export function armarAsns(
  transacciones: AsnTransaccion[],
  celulares: AsnCelularRow[],
  accesorios: AsnAccesorioRow[]
): AsnResumen[] {
  return transacciones
    .map((t) => {
      const items: AsnItem[] = [
        ...celulares
          .filter((c) => c.asn_transaction_id === t.id)
          .map((c) => ({
            tipo: 'celular' as const,
            descripcion: c.modelo,
            cantidad: c.unidades,
            ingresadas: c.unidades - c.en_transito,
          })),
        ...accesorios
          .filter((a) => a.asn_transaction_id === t.id)
          .map((a) => ({
            tipo: 'accesorio' as const,
            descripcion: a.sku,
            cantidad: a.cantidad,
            ingresadas: Math.min(a.recibidas, a.cantidad),
          })),
      ]
      const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0)
      const ingresadas = items.reduce((s, i) => s + i.ingresadas, 0)
      return {
        id: t.id,
        id_transaccion: t.id_transaccion,
        orden: t.numero_orden_externa,
        estado: t.estado,
        fecha: t.fecha,
        totalUnidades,
        ingresadas,
        pendientes: totalUnidades - ingresadas,
        items,
      }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}
