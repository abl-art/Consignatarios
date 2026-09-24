'use server'

import { fetchMixSegmentosFiltrado, type FiltroMixSegmentos, type MixSegmentos } from '@/lib/segmentos'

// Mix de segmentos filtrado por fechas de compra, merchant tercero y/o store
// (tarjeta del Dashboard 360)
export async function getMixSegmentosFiltrado(filtro: FiltroMixSegmentos): Promise<MixSegmentos> {
  try {
    return await fetchMixSegmentosFiltrado(filtro)
  } catch (e) {
    console.error('getMixSegmentosFiltrado:', e instanceof Error ? e.message : e)
    return { filas: [], totalPropia: 0, totalTerceros: 0, totalClientes: 0, actualizadoAt: null }
  }
}
