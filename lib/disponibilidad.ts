// Disponibilidad real por SKU para /inventario/stock:
//   WH Andreani + WH GOcuotas − pend. GO − pend. Andreani = disponible real
//   disponible real + en tránsito = próxima disponibilidad
//
// "Pendiente" = orden paga sin entregar y SIN IMEI asignado: cuando se asigna
// el IMEI la unidad pasa a status 'assigned' y ya salió del stock contado,
// así que volver a restarla sería un doble descuento.

import type { StockWarehouseRow } from './gocelular'

export interface PendientesPorClave {
  gocuotas: Record<string, number>
  andreani: Record<string, number>
}

export interface StockDisponibilidadRow extends StockWarehouseRow {
  pendGocuotas: number
  pendAndreani: number
  disponibleReal: number
  // Unidades compradas en el gestor de pedidos aún no informadas a GOcelular
  pedido: number
  proximaDisponibilidad: number
}

/**
 * Stock por modelo neto de pendientes de picking, para las coberturas de
 * /inventario (Modelos a comprar, Indicadores por producto): a cada model_code
 * se le restan sus pendientes GO y Andreani (piso 0, misma semántica que la
 * columna Disponible real de /inventario/stock) y se agrupa por nombre.
 */
export function descontarPendientes(
  rows: { model_code: string; model_name: string; qty: number }[],
  pendientes: PendientesPorClave,
): { model_name: string; qty: number }[] {
  const porNombre = new Map<string, number>()
  for (const r of rows) {
    const pend = (pendientes.gocuotas[r.model_code] ?? 0) + (pendientes.andreani[r.model_code] ?? 0)
    const neto = Math.max(0, r.qty - pend)
    porNombre.set(r.model_name, (porNombre.get(r.model_name) ?? 0) + neto)
  }
  return Array.from(porNombre.entries()).map(([model_name, qty]) => ({ model_name, qty }))
}

export function completarDisponibilidad(
  rows: (StockWarehouseRow & { pedido?: number })[],
  pendientes: PendientesPorClave
): StockDisponibilidadRow[] {
  return rows.map((r) => {
    const pendGocuotas = pendientes.gocuotas[r.sku] ?? 0
    const pendAndreani = pendientes.andreani[r.sku] ?? 0
    const pedido = r.pedido ?? 0
    const disponibleReal = r.whAndreani + r.whGocuotas - pendGocuotas - pendAndreani
    return {
      ...r,
      pendGocuotas,
      pendAndreani,
      disponibleReal,
      pedido,
      proximaDisponibilidad: disponibleReal + r.enTransito + pedido,
    }
  })
}
