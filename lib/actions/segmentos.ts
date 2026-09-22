'use server'

import { fetchMixSegmentosRango, type MixSegmentos } from '@/lib/segmentos'

// Mix de segmentos para un rango de fechas de compra (tarjeta del Dashboard 360)
export async function getMixSegmentosRango(desde: string, hasta: string): Promise<MixSegmentos> {
  try {
    return await fetchMixSegmentosRango(desde, hasta)
  } catch (e) {
    console.error('getMixSegmentosRango:', e instanceof Error ? e.message : e)
    return { filas: [], totalPropia: 0, totalTerceros: 0, totalClientes: 0, actualizadoAt: null }
  }
}
