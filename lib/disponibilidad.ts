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
  proximaDisponibilidad: number
}

export function completarDisponibilidad(
  rows: StockWarehouseRow[],
  pendientes: PendientesPorClave
): StockDisponibilidadRow[] {
  return rows.map((r) => {
    const pendGocuotas = pendientes.gocuotas[r.sku] ?? 0
    const pendAndreani = pendientes.andreani[r.sku] ?? 0
    const disponibleReal = r.whAndreani + r.whGocuotas - pendGocuotas - pendAndreani
    return {
      ...r,
      pendGocuotas,
      pendAndreani,
      disponibleReal,
      proximaDisponibilidad: disponibleReal + r.enTransito,
    }
  })
}
