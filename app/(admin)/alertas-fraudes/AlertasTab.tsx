'use client'

import { useState, useMemo } from 'react'
import type { AlertaSucursal, AlertaCuota1, AlertaDNI, AlertaTiendaDNI, AlertaSinImeiTienda, AlertaCuotasPagadas, TiempoAsignacionTienda } from '@/lib/gocelular'
import { formatearMoneda } from '@/lib/utils'

const MERCHANTS: Record<string, string> = {
  '1': 'Otros',
  '2026134': 'GOcelular Directo',
  '2461631': 'Ecommerce GOcelular',
  '5495277': 'RIIING',
  '6033574': 'TECNO COMPRO',
  '6115009': 'Plus Phone',
}

function merchantName(id: string): string {
  return MERCHANTS[id] ?? `Merchant ${id}`
}

interface Props {
  sucursales: AlertaSucursal[]
  cuota1: AlertaCuota1[]
  dniUsuarios: AlertaDNI[]
  dniTiendas: AlertaTiendaDNI[]
  sinImei: AlertaSinImeiTienda[]
  cuotasPagadas: AlertaCuotasPagadas
  tiempoAsignacion: TiempoAsignacionTienda[]
}

function formatMin(min: number): string {
  if (min < 1) return '<1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h >= 24) { const d = Math.round(h / 24 * 10) / 10; return `${d} días` }
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function AlertasTab({ sucursales, cuota1, dniUsuarios, dniTiendas, sinImei, cuotasPagadas, tiempoAsignacion }: Props) {
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
  const [expandedStore, setExpandedStore] = useState<string | null>(null)
  const [showCuotasPagadas, setShowCuotasPagadas] = useState(false)
  const [expandedMerchantC1, setExpandedMerchantC1] = useState<string | null>(null)
  const [expandedC1Store, setExpandedC1Store] = useState<string | null>(null)
  const [expandedDni, setExpandedDni] = useState<string | null>(null)
  const [expandedTienda, setExpandedTienda] = useState<string | null>(null)
  const [expandedImeiMerchant, setExpandedImeiMerchant] = useState<string | null>(null)
  const [expandedImeiStore, setExpandedImeiStore] = useState<string | null>(null)
  const [expandedAsigMerchant, setExpandedAsigMerchant] = useState<string | null>(null)
  const [openAlert, setOpenAlert] = useState<number | null>(null)

  function toggleAlert(n: number) { setOpenAlert(prev => prev === n ? null : n) }

  const sucPorMerchant = useMemo(() => {
    const map = new Map<string, AlertaSucursal[]>()
    for (const s of sucursales) { const arr = map.get(s.clientId) ?? []; arr.push(s); map.set(s.clientId, arr) }
    return Array.from(map.entries()).map(([clientId, stores]) => {
      const totOrdenes = stores.reduce((s, r) => s + r.ordenes, 0)
      const totAsig = stores.reduce((s, r) => s + r.asignados, 0)
      const totAct = stores.reduce((s, r) => s + r.activados, 0)
      const avgPd = stores.length > 0 ? Math.round(stores.reduce((s, r) => s + r.pdHard * r.ordenes, 0) / Math.max(totOrdenes, 1) * 10) / 10 : 0
      return { clientId, name: merchantName(clientId), stores: stores.sort((a, b) => b.pdHard - a.pdHard), totalStores: stores.length, totalOrdenes: totOrdenes, tasaActivacion: totAsig > 0 ? Math.round((totAct / totAsig) * 1000) / 10 : 100, pdHard: avgPd }
    }).sort((a, b) => b.pdHard - a.pdHard)
  }, [sucursales])

  // Cuota 1: agrupar por merchant → tienda → ordenes
  const c1PorMerchant = useMemo(() => {
    const map = new Map<string, Map<string, AlertaCuota1[]>>()
    for (const c of cuota1) {
      if (!map.has(c.clientId)) map.set(c.clientId, new Map())
      const storeMap = map.get(c.clientId)!
      const arr = storeMap.get(c.storeName) ?? []
      arr.push(c)
      storeMap.set(c.storeName, arr)
    }
    return Array.from(map.entries()).map(([clientId, storeMap]) => {
      const stores = Array.from(storeMap.entries()).map(([storeName, orders]) => ({
        storeName,
        orders: orders.sort((a, b) => b.pctCuota1 - a.pctCuota1),
        totalOrdenes: orders.length,
        bloqueados: orders.filter(o => o.bloqueado).length,
        avgPct: Math.round(orders.reduce((s, r) => s + r.pctCuota1, 0) / orders.length * 10) / 10,
      })).sort((a, b) => b.totalOrdenes - a.totalOrdenes)
      const allOrders = stores.flatMap(s => s.orders)
      return {
        clientId, name: merchantName(clientId), stores,
        totalOrdenes: allOrders.length, bloqueados: allOrders.filter(o => o.bloqueado).length,
        avgPct: allOrders.length > 0 ? Math.round(allOrders.reduce((s, r) => s + r.pctCuota1, 0) / allOrders.length * 10) / 10 : 0,
      }
    }).sort((a, b) => b.totalOrdenes - a.totalOrdenes)
  }, [cuota1])

  // Sin IMEI agrupado por merchant
  const sinImeiPorMerchant = useMemo(() => {
    const map = new Map<string, AlertaSinImeiTienda[]>()
    for (const t of sinImei) { const arr = map.get(t.clientId) ?? []; arr.push(t); map.set(t.clientId, arr) }
    return Array.from(map.entries()).map(([clientId, stores]) => ({
      clientId, name: merchantName(clientId),
      stores: stores.sort((a, b) => b.sinImei - a.sinImei),
      totalSinImei: stores.reduce((s, t) => s + t.sinImei, 0),
      totalOrdenes: stores.reduce((s, t) => s + t.total, 0),
      totalMonto: stores.reduce((s, t) => s + t.ordenes.reduce((s2, o) => s2 + o.monto, 0), 0),
    })).sort((a, b) => b.totalSinImei - a.totalSinImei)
  }, [sinImei])

  const totalSinImei = sinImei.reduce((s, t) => s + t.sinImei, 0)

  return (
    <div className="space-y-2">
      {/* ── Alerta 1: PD Hard / Tasa Activación ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => toggleAlert(1)} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
          <span className="text-gray-400 text-xs">{openAlert === 1 ? '▼' : '▶'}</span>
          <div className="w-3 h-3 rounded-full bg-red-500 shrink-0"></div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold text-gray-900">PD Hard &gt;50% o Tasa Activacion &lt;90%</h3>
            <p className="text-[10px] text-gray-400">Ordenes +20 dias. Merchant → sucursal → ordenes con DNI.</p>
          </div>
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium shrink-0">{sucursales.length}</span>
        </button>
        {openAlert === 1 && <div className="overflow-auto max-h-[500px] border-t border-gray-100">
          {sucPorMerchant.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin alertas</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Merchant / Sucursal / Orden</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">DNI</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Nombre</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Fecha</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Ordenes</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Asig.</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Tasa</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">PD</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Monto</th>
                  <th className="text-right px-3 py-2 font-medium text-red-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sucPorMerchant.flatMap(m => {
                  const isMExp = expandedMerchant === m.clientId
                  return [
                    <tr key={m.clientId} onClick={() => { setExpandedMerchant(isMExp ? null : m.clientId); setExpandedStore(null) }}
                      className={`cursor-pointer hover:bg-gray-100 font-semibold ${isMExp ? 'bg-gray-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{isMExp ? '▼' : '▶'}</td>
                      <td className="px-2 py-2 text-gray-900">{m.name} <span className="text-gray-400 font-normal">({m.totalStores} suc.)</span></td>
                      <td className="px-3 py-2" colSpan={2}></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right">{m.totalOrdenes}</td>
                      <td className="px-3 py-2 text-right">{m.stores.reduce((s, r) => s + r.asignados, 0)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${m.tasaActivacion >= 95 ? 'text-green-700' : m.tasaActivacion >= 90 ? 'text-amber-600' : 'text-red-700'}`}>{m.tasaActivacion}%</td>
                      <td className={`px-3 py-2 text-right font-bold ${m.pdHard <= 3 ? 'text-green-700' : m.pdHard <= 8 ? 'text-amber-600' : 'text-red-700'}`}>{m.pdHard}%</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                    </tr>,
                    ...(isMExp ? m.stores.flatMap(s => {
                      const isSExp = expandedStore === s.storeName
                      const bloq = s.detalleOrdenes.filter(o => o.bloqueado).length
                      return [
                        <tr key={`s-${s.storeName}`} onClick={(e) => { e.stopPropagation(); setExpandedStore(isSExp ? null : s.storeName) }}
                          className={`cursor-pointer border-l-4 border-l-red-300 bg-red-50/30 hover:bg-red-100/40 ${isSExp ? 'font-semibold' : ''}`}>
                          <td className="pl-6 py-1.5 text-gray-400">{isSExp ? '▼' : '▶'}</td>
                          <td className="px-2 py-1.5 text-gray-700 truncate max-w-[220px]" title={s.storeName}>{s.storeName}</td>
                          <td className="px-3 py-1.5" colSpan={2}></td>
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{s.ordenes}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{s.asignados}</td>
                          <td className={`px-3 py-1.5 text-right font-bold ${s.tasaActivacion >= 95 ? 'text-green-700' : s.tasaActivacion >= 90 ? 'text-amber-600' : 'text-red-700'}`}>{s.tasaActivacion}%</td>
                          <td className={`px-3 py-1.5 text-right font-bold ${s.pdHard <= 3 ? 'text-green-700' : s.pdHard <= 8 ? 'text-amber-600' : 'text-red-700'}`}>{s.pdHard}%</td>
                          <td className="px-3 py-1.5"></td>
                          <td className={`px-3 py-1.5 text-right font-bold ${bloq > 0 ? 'text-red-700' : 'text-gray-400'}`}>{bloq > 0 ? `${bloq} bloq` : '—'}</td>
                        </tr>,
                        ...(isSExp ? s.detalleOrdenes.map(o => (
                          <tr key={o.orderId} className={`border-l-4 ${o.bloqueado ? 'border-l-red-500 bg-red-50/60' : 'border-l-orange-200 bg-orange-50/20'}`}>
                            <td className="pl-10 py-1"></td>
                            <td className="px-2 py-1 text-gray-400 font-mono">#{o.orderId}</td>
                            <td className="px-3 py-1 font-mono text-gray-700">{o.userDni}</td>
                            <td className="px-3 py-1 text-gray-600 truncate max-w-[120px]" title={o.userName}>{o.userName}</td>
                            <td className="px-3 py-1 text-right text-gray-400">{o.fecha}</td>
                            <td className="px-3 py-1" colSpan={2}></td>
                            <td className="px-3 py-1"></td>
                            <td className="px-3 py-1"></td>
                            <td className="px-3 py-1 text-right text-gray-600">{formatearMoneda(o.monto)}</td>
                            <td className={`px-3 py-1 text-right font-bold ${o.bloqueado ? 'text-red-700' : o.deviceStatus === 'active' ? 'text-green-700' : 'text-gray-400'}`}>
                              {o.bloqueado ? 'BLOQ' : o.deviceStatus === 'active' ? 'activo' : o.deviceStatus}
                            </td>
                          </tr>
                        )) : []),
                      ]
                    }) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>}
      </div>

      {/* ── Alerta 2: Cuota 1 > 50% ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => toggleAlert(2)} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
          <span className="text-gray-400 text-xs">{openAlert === 2 ? '▼' : '▶'}</span>
          <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0"></div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold text-gray-900">Cuota 1 &gt; 50% del valor del equipo</h3>
            <p className="text-[10px] text-gray-400">Anticipo sospechosamente alto. Merchant → tienda → ordenes.</p>
          </div>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">{cuota1.length}</span>
        </button>
        {openAlert === 2 && <div className="overflow-auto max-h-[500px] border-t border-gray-100">
          {c1PorMerchant.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin alertas</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Merchant / Tienda / Orden</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Ordenes</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Fecha</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Valor equipo</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Cuota 1</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">% C1</th>
                  <th className="text-right px-3 py-2 font-medium text-red-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {c1PorMerchant.flatMap(m => {
                  const isMExp = expandedMerchantC1 === m.clientId
                  return [
                    <tr key={m.clientId} onClick={() => { setExpandedMerchantC1(isMExp ? null : m.clientId); setExpandedC1Store(null) }}
                      className={`cursor-pointer hover:bg-gray-100 font-semibold ${isMExp ? 'bg-gray-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{isMExp ? '▼' : '▶'}</td>
                      <td className="px-2 py-2 text-gray-900">{m.name} <span className="text-gray-400 font-normal">({m.stores.length} tiendas)</span></td>
                      <td className="px-3 py-2 text-right">{m.totalOrdenes}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right text-amber-700 font-bold">{m.avgPct}%</td>
                      <td className={`px-3 py-2 text-right font-bold ${m.bloqueados > 0 ? 'text-red-700' : 'text-gray-400'}`}>{m.bloqueados > 0 ? `${m.bloqueados} bloq` : '—'}</td>
                    </tr>,
                    ...(isMExp ? m.stores.flatMap(st => {
                      const isStExp = expandedC1Store === st.storeName
                      return [
                        <tr key={`c1s-${st.storeName}`} onClick={(e) => { e.stopPropagation(); setExpandedC1Store(isStExp ? null : st.storeName) }}
                          className={`cursor-pointer border-l-4 border-l-amber-300 bg-amber-50/30 hover:bg-amber-100/40 ${isStExp ? 'font-semibold' : ''}`}>
                          <td className="pl-6 py-1.5 text-gray-400">{isStExp ? '▼' : '▶'}</td>
                          <td className="px-2 py-1.5 text-gray-700 truncate max-w-[220px]" title={st.storeName}>{st.storeName}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{st.totalOrdenes}</td>
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5 text-right text-amber-700 font-bold">{st.avgPct}%</td>
                          <td className={`px-3 py-1.5 text-right font-bold ${st.bloqueados > 0 ? 'text-red-700' : 'text-gray-400'}`}>{st.bloqueados > 0 ? `${st.bloqueados} bloq` : '—'}</td>
                        </tr>,
                        ...(isStExp ? st.orders.map(o => (
                          <tr key={o.orderId} className={`border-l-4 ${o.bloqueado ? 'border-l-red-500 bg-red-50/50' : 'border-l-amber-200 bg-amber-50/20'}`}>
                            <td className="pl-10 py-1"></td>
                            <td className="px-2 py-1 text-gray-400 font-mono">#{o.orderId}</td>
                            <td className="px-3 py-1"></td>
                            <td className="px-3 py-1 text-right text-gray-500">{o.fecha}</td>
                            <td className="px-3 py-1 text-right text-gray-700">{formatearMoneda(o.totalOrden)}</td>
                            <td className="px-3 py-1 text-right text-amber-700 font-medium">{formatearMoneda(o.cuota1)}</td>
                            <td className="px-3 py-1 text-right text-red-700 font-bold">{o.pctCuota1}%</td>
                            <td className={`px-3 py-1 text-right font-bold ${o.bloqueado ? 'text-red-700' : 'text-gray-400'}`}>{o.bloqueado ? 'BLOQ' : '—'}</td>
                          </tr>
                        )) : []),
                      ]
                    }) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>}
      </div>

      {/* ── Alerta 3: DNI con 2+ ordenes ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => toggleAlert(3)} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
          <span className="text-gray-400 text-xs">{openAlert === 3 ? '▼' : '▶'}</span>
          <div className="w-3 h-3 rounded-full bg-purple-500 shrink-0"></div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold text-gray-900">Usuarios con 2+ ordenes (por DNI)</h3>
            <p className="text-[10px] text-gray-400">Mismo DNI en multiples compras. Clic para ver detalle.</p>
          </div>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium shrink-0">{dniUsuarios.length}</span>
        </button>
        {openAlert === 3 && <div className="overflow-auto max-h-[500px] border-t border-gray-100">
          {dniUsuarios.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin alertas</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">DNI</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Nombre</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Tienda</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Ordenes</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Tiendas</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Primera</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Ultima</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Monto</th>
                  <th className="text-right px-3 py-2 font-medium text-red-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dniUsuarios.flatMap(u => {
                  const isExp = expandedDni === u.userDni
                  return [
                    <tr key={u.userDni} onClick={() => setExpandedDni(isExp ? null : u.userDni)}
                      className={`cursor-pointer hover:bg-gray-100 ${isExp ? 'font-semibold bg-gray-50' : ''} ${u.bloqueados > 0 ? 'bg-red-50' : u.ordenes >= 3 ? 'bg-red-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{isExp ? '▼' : '▶'}</td>
                      <td className="px-2 py-2 font-mono text-gray-900">{u.userDni}</td>
                      <td className="px-3 py-2 text-gray-700 truncate max-w-[130px]">{u.userName}</td>
                      <td className="px-3 py-2"></td>
                      <td className={`px-3 py-2 text-right font-bold ${u.ordenes >= 3 ? 'text-red-700' : 'text-amber-700'}`}>{u.ordenes}</td>
                      <td className={`px-3 py-2 text-right ${u.cantTiendas > 1 ? 'text-red-700 font-bold' : 'text-gray-500'}`}>{u.cantTiendas}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{u.primera}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{u.ultima}</td>
                      <td className="px-3 py-2"></td>
                      <td className={`px-3 py-2 text-right font-bold ${u.bloqueados > 0 ? 'text-red-700' : 'text-gray-400'}`}>{u.bloqueados > 0 ? `${u.bloqueados} bloq` : '—'}</td>
                    </tr>,
                    ...(isExp ? u.detalles.map(d => (
                      <tr key={d.orderId} className={`border-l-4 ${d.bloqueado ? 'border-l-red-500 bg-red-50/50' : 'border-l-purple-300 bg-purple-50/30'}`}>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1 text-gray-400 font-mono">#{d.orderId}</td>
                        <td className="px-3 py-1 text-gray-500 text-[10px]">{merchantName(d.clientId)}</td>
                        <td className="px-3 py-1 text-gray-600 truncate max-w-[180px]" title={d.storeName}>{d.storeName}</td>
                        <td className="px-3 py-1" colSpan={2}></td>
                        <td className="px-3 py-1 text-right text-gray-400" colSpan={2}>{d.fecha}</td>
                        <td className="px-3 py-1 text-right text-gray-600">{formatearMoneda(d.monto)}</td>
                        <td className={`px-3 py-1 text-right font-bold ${d.bloqueado ? 'text-red-700' : 'text-gray-400'}`}>{d.bloqueado ? 'BLOQ' : '—'}</td>
                      </tr>
                    )) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>}
      </div>

      {/* ── Alerta 4: Tiendas terceros con DNI repetido ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => toggleAlert(4)} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
          <span className="text-gray-400 text-xs">{openAlert === 4 ? '▼' : '▶'}</span>
          <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0"></div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold text-gray-900">Tiendas terceros con DNI repetido</h3>
            <p className="text-[10px] text-gray-400">Solo terceros. Posible connivencia con vendedores.</p>
          </div>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium shrink-0">{dniTiendas.length}</span>
        </button>
        {openAlert === 4 && <div className="overflow-auto max-h-[500px] border-t border-gray-100">
          {dniTiendas.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin alertas</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Tienda / Usuario</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Merchant</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">DNI</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Nombre</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Usuarios</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Ordenes</th>
                  <th className="text-right px-3 py-2 font-medium text-red-700">Bloq.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dniTiendas.flatMap(t => {
                  const isExp = expandedTienda === t.storeName
                  return [
                    <tr key={t.storeName} onClick={() => setExpandedTienda(isExp ? null : t.storeName)}
                      className={`cursor-pointer hover:bg-gray-100 ${isExp ? 'font-semibold bg-gray-50' : ''} ${t.bloqueadosTotal > 0 ? 'bg-red-50' : t.usuariosMulti >= 5 ? 'bg-red-50' : t.usuariosMulti >= 3 ? 'bg-amber-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{isExp ? '▼' : '▶'}</td>
                      <td className="px-2 py-2 text-gray-900 truncate max-w-[250px]" title={t.storeName}>{t.storeName}</td>
                      <td className="px-3 py-2 text-gray-500">{merchantName(t.clientId)}</td>
                      <td className="px-3 py-2" colSpan={2}></td>
                      <td className={`px-3 py-2 text-right font-bold ${t.usuariosMulti >= 5 ? 'text-red-700' : t.usuariosMulti >= 3 ? 'text-amber-700' : 'text-gray-900'}`}>{t.usuariosMulti}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{t.ordenesDeMulti}</td>
                      <td className={`px-3 py-2 text-right font-bold ${t.bloqueadosTotal > 0 ? 'text-red-700' : 'text-gray-400'}`}>{t.bloqueadosTotal > 0 ? t.bloqueadosTotal : '—'}</td>
                    </tr>,
                    ...(isExp ? t.usuarios.map(u => (
                      <tr key={`${t.storeName}-${u.userDni}`} className={`border-l-4 ${u.bloqueados > 0 ? 'border-l-red-500 bg-red-50/50' : 'border-l-indigo-300 bg-indigo-50/30'}`}>
                        <td className="px-2 py-1.5"></td>
                        <td className="px-2 py-1.5"></td>
                        <td className="px-3 py-1.5"></td>
                        <td className="px-3 py-1.5 font-mono text-gray-600">{u.userDni}</td>
                        <td className="px-3 py-1.5 text-gray-600">{u.userName}</td>
                        <td className="px-3 py-1.5"></td>
                        <td className={`px-3 py-1.5 text-right font-bold ${u.ordenes >= 3 ? 'text-red-700' : 'text-amber-700'}`}>{u.ordenes}</td>
                        <td className={`px-3 py-1.5 text-right font-bold ${u.bloqueados > 0 ? 'text-red-700' : 'text-gray-400'}`}>{u.bloqueados > 0 ? u.bloqueados : '—'}</td>
                      </tr>
                    )) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>}
      </div>

      {/* ── Alerta 5: Ordenes terceros sin IMEI ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => toggleAlert(5)} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
          <span className="text-gray-400 text-xs">{openAlert === 5 ? '▼' : '▶'}</span>
          <div className="w-3 h-3 rounded-full bg-rose-500 shrink-0"></div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold text-gray-900">Ordenes de terceros sin IMEI asignado</h3>
            <p className="text-[10px] text-gray-400">Ordenes entregadas sin equipo. Merchant → tienda → ordenes.</p>
          </div>
          <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium shrink-0">{totalSinImei}</span>
        </button>
        {openAlert === 5 && <div className="overflow-auto max-h-[500px] border-t border-gray-100">
          {sinImeiPorMerchant.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin alertas</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Merchant / Tienda / Orden</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">DNI</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Nombre</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Fecha</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Sin IMEI</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Total ord.</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sinImeiPorMerchant.flatMap(m => {
                  const isMExp = expandedImeiMerchant === m.clientId
                  return [
                    <tr key={m.clientId} onClick={() => { setExpandedImeiMerchant(isMExp ? null : m.clientId); setExpandedImeiStore(null) }}
                      className={`cursor-pointer hover:bg-gray-100 font-semibold ${isMExp ? 'bg-gray-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{isMExp ? '▼' : '▶'}</td>
                      <td className="px-2 py-2 text-gray-900">{m.name} <span className="text-gray-400 font-normal">({m.stores.length} tiendas)</span></td>
                      <td className="px-3 py-2" colSpan={2}></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right text-rose-700 font-bold">{m.totalSinImei}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{m.totalOrdenes}</td>
                      <td className="px-3 py-2 text-right text-rose-700 font-semibold">{formatearMoneda(m.totalMonto)}</td>
                    </tr>,
                    ...(isMExp ? m.stores.flatMap(t => {
                      const isSExp = expandedImeiStore === t.storeName
                      return [
                        <tr key={`si-${t.storeName}`} onClick={(e) => { e.stopPropagation(); setExpandedImeiStore(isSExp ? null : t.storeName) }}
                          className={`cursor-pointer border-l-4 border-l-rose-300 bg-rose-50/30 hover:bg-rose-100/40 ${isSExp ? 'font-semibold' : ''}`}>
                          <td className="pl-6 py-1.5 text-gray-400">{isSExp ? '▼' : '▶'}</td>
                          <td className="px-2 py-1.5 text-gray-700 truncate max-w-[220px]" title={t.storeName}>{t.storeName}</td>
                          <td className="px-3 py-1.5" colSpan={2}></td>
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5 text-right text-rose-700 font-bold">{t.sinImei}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{t.total}</td>
                          <td className="px-3 py-1.5 text-right text-rose-700 font-medium">{formatearMoneda(t.ordenes.reduce((s, o) => s + o.monto, 0))}</td>
                        </tr>,
                        ...(isSExp ? t.ordenes.map(o => (
                          <tr key={o.orderId} className="border-l-4 border-l-rose-200 bg-rose-50/20">
                            <td className="pl-10 py-1"></td>
                            <td className="px-2 py-1 text-gray-400 font-mono">#{o.orderId}</td>
                            <td className="px-3 py-1 font-mono text-gray-700">{o.userDni}</td>
                            <td className="px-3 py-1 text-gray-600 truncate max-w-[120px]" title={o.userName}>{o.userName}</td>
                            <td className="px-3 py-1 text-right text-gray-400">{o.fecha}</td>
                            <td className="px-3 py-1" colSpan={2}></td>
                            <td className="px-3 py-1 text-right text-gray-600">{formatearMoneda(o.monto)}</td>
                          </tr>
                        )) : []),
                      ]
                    }) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>}
      </div>
      {/* ── Alerta 7: Tiempo hasta asignación IMEI ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => toggleAlert(7)} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
          <span className="text-gray-400 text-xs">{openAlert === 7 ? '▼' : '▶'}</span>
          <div className="w-3 h-3 rounded-full bg-cyan-500 shrink-0"></div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold text-gray-900">Tiempo hasta asignación IMEI (terceros)</h3>
            <p className="text-[10px] text-gray-400">Desde delivered_at hasta asignación IMEI. Últimos 90 días. &gt;30 min el dispositivo puede ya estar encendido y no se podrá enrolar.</p>
          </div>
          <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-medium shrink-0">{tiempoAsignacion.reduce((s, t) => s + t.total, 0)}</span>
        </button>
        {openAlert === 7 && (() => {
          // Agrupar por merchant
          const asigPorMerchant = (() => {
            const map = new Map<string, TiempoAsignacionTienda[]>()
            for (const t of tiempoAsignacion) { const arr = map.get(t.clientId) ?? []; arr.push(t); map.set(t.clientId, arr) }
            return Array.from(map.entries()).map(([clientId, stores]) => {
              const sum = (fn: (t: TiempoAsignacionTienda) => number) => stores.reduce((s, t) => s + fn(t), 0)
              return {
                clientId, name: merchantName(clientId),
                stores: stores.sort((a, b) => b.total - a.total),
                total: sum(t => t.total), dentro30min: sum(t => t.dentro30min),
                entre30y60: sum(t => t.entre30y60), mas1h: sum(t => t.mas1h),
                activos: sum(t => t.activos), bloqueados: sum(t => t.bloqueados),
                idle: sum(t => t.idle), readyForUse: sum(t => t.readyForUse), sinTrustonic: sum(t => t.sinTrustonic),
              }
            }).sort((a, b) => b.total - a.total)
          })()

          return <div className="overflow-auto max-h-[600px] border-t border-gray-100">
          {asigPorMerchant.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin datos</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Merchant / Tienda</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Total</th>
                  <th className="text-right px-2 py-2 font-medium text-green-700">&le;30min</th>
                  <th className="text-right px-2 py-2 font-medium text-green-700">%</th>
                  <th className="text-right px-2 py-2 font-medium text-amber-700">30-60min</th>
                  <th className="text-right px-2 py-2 font-medium text-amber-700">%</th>
                  <th className="text-right px-2 py-2 font-medium text-red-700">&gt;1h</th>
                  <th className="text-right px-2 py-2 font-medium text-red-700">%</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Más rápido</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Más lento</th>
                  <th className="text-right px-2 py-2 font-medium text-green-700">Activo</th>
                  <th className="text-right px-2 py-2 font-medium text-red-700">Bloq</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-500">Idle</th>
                  <th className="text-right px-2 py-2 font-medium text-blue-700">Ready</th>
                  <th className="text-right px-2 py-2 font-medium text-orange-700">Sin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {asigPorMerchant.flatMap(m => {
                  const isMExp = expandedAsigMerchant === m.clientId
                  const mPct30 = m.total > 0 ? Math.round(m.dentro30min / m.total * 100) : 0
                  const mPct3060 = m.total > 0 ? Math.round(m.entre30y60 / m.total * 100) : 0
                  const mPct1h = m.total > 0 ? Math.round(m.mas1h / m.total * 100) : 0
                  return [
                    <tr key={m.clientId} onClick={() => setExpandedAsigMerchant(isMExp ? null : m.clientId)}
                      className={`cursor-pointer hover:bg-gray-100 font-semibold ${isMExp ? 'bg-gray-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{isMExp ? '▼' : '▶'}</td>
                      <td className="px-2 py-2 text-gray-900">{m.name} <span className="text-gray-400 font-normal">({m.stores.length} suc.)</span></td>
                      <td className="px-2 py-2 text-right">{m.total}</td>
                      <td className="px-2 py-2 text-right text-green-700">{m.dentro30min}</td>
                      <td className={`px-2 py-2 text-right font-bold ${mPct30 >= 80 ? 'text-green-700' : mPct30 >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{mPct30}%</td>
                      <td className="px-2 py-2 text-right text-amber-700">{m.entre30y60}</td>
                      <td className="px-2 py-2 text-right text-amber-700">{mPct3060}%</td>
                      <td className="px-2 py-2 text-right text-red-700">{m.mas1h}</td>
                      <td className="px-2 py-2 text-right text-red-700 font-bold">{mPct1h}%</td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2"></td>
                      <td className="px-2 py-2 text-right text-green-700">{m.activos || '—'}</td>
                      <td className="px-2 py-2 text-right text-red-700">{m.bloqueados || '—'}</td>
                      <td className="px-2 py-2 text-right text-gray-500">{m.idle || '—'}</td>
                      <td className="px-2 py-2 text-right text-blue-700">{m.readyForUse || '—'}</td>
                      <td className="px-2 py-2 text-right text-orange-700">{m.sinTrustonic || '—'}</td>
                    </tr>,
                    ...(isMExp ? m.stores.map(t => {
                      const pct30 = t.total > 0 ? Math.round(t.dentro30min / t.total * 100) : 0
                      const pct3060 = t.total > 0 ? Math.round(t.entre30y60 / t.total * 100) : 0
                      const pct1h = t.total > 0 ? Math.round(t.mas1h / t.total * 100) : 0
                      const rowColor = pct30 >= 80 ? '' : pct30 >= 50 ? 'bg-amber-50/50' : 'bg-red-50/50'
                      return (
                        <tr key={t.storeName} className={`border-l-4 border-l-cyan-300 ${rowColor} hover:bg-gray-100`}>
                          <td className="px-2 py-1.5"></td>
                          <td className="px-2 py-1.5 text-gray-700 truncate max-w-[220px]" title={t.storeName}>{t.storeName}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-gray-900">{t.total}</td>
                          <td className="px-2 py-1.5 text-right text-green-700 font-semibold">{t.dentro30min}</td>
                          <td className={`px-2 py-1.5 text-right font-bold ${pct30 >= 80 ? 'text-green-700' : pct30 >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{pct30}%</td>
                          <td className="px-2 py-1.5 text-right text-amber-700">{t.entre30y60}</td>
                          <td className="px-2 py-1.5 text-right text-amber-700">{pct3060}%</td>
                          <td className="px-2 py-1.5 text-right text-red-700 font-semibold">{t.mas1h}</td>
                          <td className="px-2 py-1.5 text-right text-red-700 font-bold">{pct1h}%</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{formatMin(t.minMin)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{formatMin(t.maxMin)}</td>
                          <td className="px-2 py-1.5 text-right text-green-700">{t.activos || '—'}</td>
                          <td className={`px-2 py-1.5 text-right ${t.bloqueados > 0 ? 'text-red-700 font-bold' : 'text-gray-400'}`}>{t.bloqueados || '—'}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{t.idle || '—'}</td>
                          <td className="px-2 py-1.5 text-right text-blue-700">{t.readyForUse || '—'}</td>
                          <td className={`px-2 py-1.5 text-right ${t.sinTrustonic > 0 ? 'text-orange-700 font-bold' : 'text-gray-400'}`}>{t.sinTrustonic || '—'}</td>
                        </tr>
                      )
                    }) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
          </div>
        })()}
      </div>

      {/* Alerta 6: Cuotas 100% pagadas */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => setShowCuotasPagadas(!showCuotasPagadas)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50">
          <div className="flex items-center gap-3">
            <span className="text-lg">💰</span>
            <div className="text-left">
              <p className="font-semibold text-gray-900 text-sm">Equipos con todas las cuotas pagadas</p>
              <p className="text-xs text-gray-500">Plazo promedio de cancelacion: <span className="font-bold text-amber-700">{cuotasPagadas.promedioAdelanto} dias</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">{cuotasPagadas.total}</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showCuotasPagadas ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {showCuotasPagadas && (
          cuotasPagadas.detalle.length === 0 ? (
            <div className="border-t border-gray-200 p-6 text-center text-sm text-gray-400">No se pudieron cargar los datos. Recarga la pagina.</div>
          ) : (
          <div className="border-t border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Orden</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">DNI</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Tienda</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Tipo</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Cuotas</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Fecha orden</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Ultimo pago</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Plazo (dias)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cuotasPagadas.detalle.map(d => (
                  <tr key={d.orderId} className={`hover:bg-gray-50 ${d.diasAdelanto < 60 ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-2 text-gray-700 font-mono">{d.orderId.slice(0, 8)}...</td>
                    <td className="px-4 py-2 text-gray-900 font-semibold">{d.userDni}</td>
                    <td className="px-4 py-2 text-gray-700">{d.userName}</td>
                    <td className="px-4 py-2 text-gray-600 truncate max-w-[200px]">{d.storeName}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${d.esTercero ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                        {d.esTercero ? 'Tercero' : 'Propio'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center font-semibold">{d.totalCuotas}</td>
                    <td className="px-4 py-2 text-gray-600">{d.fechaOrden}</td>
                    <td className="px-4 py-2 text-gray-600">{d.fechaUltimoPago}</td>
                    <td className={`px-4 py-2 text-right font-bold ${d.diasAdelanto < 60 ? 'text-red-700' : 'text-gray-900'}`}>{d.diasAdelanto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        )}
      </div>
    </div>
  )
}
