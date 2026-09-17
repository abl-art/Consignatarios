'use client'

import CanalPills, { type Canal } from './CanalPills'
import BloqueoPills, { type BloqueoFiltro } from './BloqueoPills'
import type { MerchantTercero } from '@/lib/actions/finanzas'

interface Props {
  canal: Canal
  setCanal: (c: Canal) => void
  bloqueo: BloqueoFiltro
  setBloqueo: (b: BloqueoFiltro) => void
  merchantId: string
  setMerchant: (m: string) => void
  storeId: string
  setStore: (s: string) => void
  merchants: MerchantTercero[]
  cargando: boolean
}

// Barra de filtros compartida por PD/DPD/Vintage: canal + solución de bloqueo
// y, con Venta de Terceros elegido, desplegables de Merchant y Store para
// mirar incobrabilidad por tienda.
export default function FiltrosIndicadores({ canal, setCanal, bloqueo, setBloqueo, merchantId, setMerchant, storeId, setStore, merchants, cargando }: Props) {
  const merchant = merchants.find(m => m.clientId === merchantId)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <CanalPills canal={canal} onChange={setCanal} />
      <BloqueoPills bloqueo={bloqueo} onChange={setBloqueo} />
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
