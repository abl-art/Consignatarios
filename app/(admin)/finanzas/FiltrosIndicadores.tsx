'use client'

import CanalPills, { type Canal } from './CanalPills'
import BloqueoPills, { type BloqueoFiltro } from './BloqueoPills'
import type { MerchantTercero } from '@/lib/actions/finanzas'

// Los 16 segmentos de la Estructura de Crédito GO: letra = límite en tickets
// promedio (A >4.8 · B 2–4.8 · C 1–2 · D <1), número = antigüedad desde la
// activación (1 = +12m · 2 = 4–12m · 3 = <4m · 4 = inactivos)
const SEGMENTOS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4']

interface Props {
  canal: Canal
  setCanal: (c: Canal) => void
  bloqueo: BloqueoFiltro
  setBloqueo: (b: BloqueoFiltro) => void
  merchantId: string
  setMerchant: (m: string) => void
  storeId: string
  setStore: (s: string) => void
  segmento: string
  setSegmento: (s: string) => void
  merchants: MerchantTercero[]
  cargando: boolean
}

// Barra de filtros compartida por PD/DPD/Vintage: canal + solución de bloqueo
// + segmento de cliente y, con Venta de Terceros elegido, desplegables de
// Merchant y Store para mirar incobrabilidad por tienda.
export default function FiltrosIndicadores({ canal, setCanal, bloqueo, setBloqueo, merchantId, setMerchant, storeId, setStore, segmento, setSegmento, merchants, cargando }: Props) {
  const merchant = merchants.find(m => m.clientId === merchantId)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <CanalPills canal={canal} onChange={setCanal} />
      <BloqueoPills bloqueo={bloqueo} onChange={setBloqueo} />
      <select
        value={segmento}
        onChange={e => setSegmento(e.target.value)}
        className="px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-700"
      >
        <option value="">Todos los segmentos</option>
        {SEGMENTOS.map(s => (
          <option key={s} value={s}>Segmento {s}</option>
        ))}
      </select>
      {canal === 'terceros' && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={merchantId}
            onChange={e => setMerchant(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-700"
          >
            <option value="">Todos los merchants</option>
            {merchants.map(m => (
              <option key={m.clientId} value={m.clientId}>{m.nombre}</option>
            ))}
          </select>
          <select
            value={storeId}
            onChange={e => setStore(e.target.value)}
            disabled={!merchant}
            className="px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-700 disabled:bg-gray-50 disabled:text-gray-400 max-w-[280px]"
          >
            <option value="">{merchant ? 'Todas las stores' : 'Elegí un merchant'}</option>
            {merchant?.stores.map(s => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
      )}
      {cargando && <span className="text-xs text-gray-400 animate-pulse">Actualizando…</span>}
    </div>
  )
}
