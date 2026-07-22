'use server'

import { fetchVentasPorMarca, type VentasPorMarca } from '@/lib/gocelular'

export async function getVentasPorMarca(desde: string, hasta: string): Promise<VentasPorMarca[]> {
  return fetchVentasPorMarca(desde, hasta)
}
