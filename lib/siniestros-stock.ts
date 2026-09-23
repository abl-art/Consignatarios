// Siniestros de almacenamiento ("diferencias de stock") de la pestaña
// Siniestros de /compras/envios: equipos extraviados, rotos o hurtados en el
// depósito, sin guía de Andreani. Se cargan a mano eligiendo el producto del
// catálogo; el IMEI es opcional (a veces no se sabe cuál unidad falta).
// El warehouse de Andreani tiene seguro, así que un extravío/hurto también
// puede terminar en nota de crédito, igual que los siniestros de distribución.
//
// El registro vive en Supabase (siniestros_stock, scripts/siniestros-stock.sql);
// si hay IMEI se enriquece contra GOcelular (ubicación, status, Trustonic).

export const TIPOS_SINIESTRO_STOCK = ['extraviado', 'roto', 'hurtado'] as const
export type TipoSiniestroStock = (typeof TIPOS_SINIESTRO_STOCK)[number]

/** Fila de siniestros_stock en Supabase */
export interface SiniestroStockRow {
  id: string
  producto: string
  sku: string | null
  imei: string | null
  tipo: TipoSiniestroStock
  /** Fecha del hallazgo (YYYY-MM-DD) */
  fecha: string
  nota: string | null
  estado: 'abierto' | 'resuelto'
  resueltoAt: string | null
  notaCredito: boolean
  createdAt: string
}

/** Datos del equipo en GOcelular, cuando el IMEI se conoce y figura */
export interface DispositivoStock {
  imei: string
  modelo: string | null
  ubicacion: string | null
  status: string | null
  trustonicStatus: string | null
}

export interface SiniestroStock extends SiniestroStockRow {
  /** null si no hay IMEI o el IMEI no figura en GOcelular */
  dispositivo: DispositivoStock | null
  /** Días desde el hallazgo; en resueltos, días que estuvo abierto */
  dias: number
}

const DIA_MS = 24 * 60 * 60 * 1000

function diasEntre(desde: string, hasta: Date): number {
  return Math.max(0, Math.floor((hasta.getTime() - new Date(desde).getTime()) / DIA_MS))
}

export function armarSiniestrosStock(
  rows: SiniestroStockRow[],
  dispositivos: DispositivoStock[],
  ahora: Date,
): SiniestroStock[] {
  const porImei = new Map(dispositivos.map(d => [d.imei, d]))
  const armados = rows.map(r => ({
    ...r,
    dispositivo: r.imei ? porImei.get(r.imei) ?? null : null,
    dias: diasEntre(r.fecha, r.estado === 'resuelto' && r.resueltoAt ? new Date(r.resueltoAt) : ahora),
  }))
  // Abiertos primero; dentro de cada grupo, hallazgo más reciente arriba
  return armados.sort((a, b) =>
    (a.estado === 'resuelto' ? 1 : 0) - (b.estado === 'resuelto' ? 1 : 0)
    || b.fecha.localeCompare(a.fecha)
    || b.createdAt.localeCompare(a.createdAt))
}
