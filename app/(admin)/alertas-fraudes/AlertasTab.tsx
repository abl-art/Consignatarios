'use client'

import { useState, useMemo } from 'react'
import type { AlertaSucursal, AlertaCuota1, AlertaDNI, AlertaTiendaDNI } from '@/lib/gocelular'
import { formatearMoneda } from '@/lib/utils'

const MERCHANTS: Record<string, string> = {
  '1': 'Otros',
  '2026134': 'GOcelular Directo',
  '2461631': 'Ecommerce GOcelular',
  '5495277': 'RIIING',
  '6033574': 'TECNO COMPRO',
}

function merchantName(id: string): string {
  return MERCHANTS[id] ?? `Merchant ${id}`
}

interface Props {
  sucursales: AlertaSucursal[]
  cuota1: AlertaCuota1[]
  dniUsuarios: AlertaDNI[]
  dniTiendas: AlertaTiendaDNI[]
}

export default function AlertasTab({ sucursales, cuota1, dniUsuarios, dniTiendas }: Props) {
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
  const [expandedStore, setExpandedStore] = useState<string | null>(null)
  const [expandedMerchantC1, setExpandedMerchantC1] = useState<string | null>(null)
  const [expandedDni, setExpandedDni] = useState<string | null>(null)
  const [expandedTienda, setExpandedTienda] = useState<string | null>(null)

  const sucPorMerchant = useMemo(() => {
    const map = new Map<string, AlertaSucursal[]>()
    for (const s of sucursales) {
      const arr = map.get(s.clientId) ?? []
      arr.push(s)
      map.set(s.clientId, arr)
    }
    return Array.from(map.entries()).map(([clientId, stores]) => {
      const totOrdenes = stores.reduce((s, r) => s + r.ordenes, 0)
      const totAsig = stores.reduce((s, r) => s + r.asignados, 0)
      const totAct = stores.reduce((s, r) => s + r.activados, 0)
      const avgPd = stores.length > 0 ? Math.round(stores.reduce((s, r) => s + r.pdHard * r.ordenes, 0) / Math.max(totOrdenes, 1) * 10) / 10 : 0
      return { clientId, name: merchantName(clientId), stores: stores.sort((a, b) => b.pdHard - a.pdHard), totalStores: stores.length, totalOrdenes: totOrdenes, tasaActivacion: totAsig > 0 ? Math.round((totAct / totAsig) * 1000) / 10 : 100, pdHard: avgPd }
    }).sort((a, b) => b.pdHard - a.pdHard)
  }, [sucursales])

  const c1PorMerchant = useMemo(() => {
    const map = new Map<string, AlertaCuota1[]>()
    for (const c of cuota1) { const arr = map.get(c.clientId) ?? []; arr.push(c); map.set(c.clientId, arr) }
    return Array.from(map.entries()).map(([clientId, orders]) => ({
      clientId, name: merchantName(clientId), orders: orders.sort((a, b) => b.pctCuota1 - a.pctCuota1),
      totalOrdenes: orders.length, bloqueados: orders.filter(o => o.bloqueado).length,
      avgPct: orders.length > 0 ? Math.round(orders.reduce((s, r) => s + r.pctCuota1, 0) / orders.length * 10) / 10 : 0,
    })).sort((a, b) => b.totalOrdenes - a.totalOrdenes)
  }, [cuota1])

  return (
    <div className="space-y-6">
      {/* Alerta 1: Sucursales sospechosas — full width */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">PD Hard &gt;50% o Tasa Activ. &lt;90%</h3>
            <p className="text-[10px] text-gray-400">Ordenes +20 dias. PD Hard cuota 2. Clic en merchant para ver sucursales, clic en sucursal para ver ordenes con DNI.</p>
          </div>
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{sucursales.length}</span>
        </div>
        <div className="overflow-auto max-h-[500px]">
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
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Ord.</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Tasa</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">PD</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Monto</th>
                  <th className="text-right px-3 py-2 font-medium text-red-700">Bloq.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sucPorMerchant.flatMap(m => {
                  const isMerchantExp = expandedMerchant === m.clientId
                  return [
                    <tr key={m.clientId} onClick={() => { setExpandedMerchant(isMerchantExp ? null : m.clientId); setExpandedStore(null) }} className={`cursor-pointer hover:bg-gray-100 font-semibold ${isMerchantExp ? 'bg-gray-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{isMerchantExp ? '▼' : '▶'}</td>
                      <td className="px-2 py-2 text-gray-900">{m.name} <span className="text-gray-400 font-normal">({m.totalStores})</span></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right text-gray-700">{m.totalOrdenes}</td>
                      <td className={`px-3 py-2 text-right font-bold ${m.tasaActivacion >= 95 ? 'text-green-700' : m.tasaActivacion >= 90 ? 'text-amber-600' : 'text-red-700'}`}>{m.tasaActivacion}%</td>
                      <td className={`px-3 py-2 text-right font-bold ${m.pdHard <= 3 ? 'text-green-700' : m.pdHard <= 8 ? 'text-amber-600' : 'text-red-700'}`}>{m.pdHard}%</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                    </tr>,
                    ...(isMerchantExp ? m.stores.flatMap(s => {
                      const isStoreExp = expandedStore === s.storeName
                      const bloqueados = s.detalleOrdenes.filter(o => o.bloqueado).length
                      return [
                        <tr key={`${m.clientId}-${s.storeName}`} onClick={(e) => { e.stopPropagation(); setExpandedStore(isStoreExp ? null : s.storeName) }}
                          className={`cursor-pointer border-l-4 border-l-red-300 bg-red-50/30 hover:bg-red-100/40 ${isStoreExp ? 'font-semibold' : ''}`}>
                          <td className="px-2 py-1.5 text-gray-400 pl-6">{isStoreExp ? '▼' : '▶'}</td>
                          <td className="px-2 py-1.5 text-gray-700 truncate max-w-[200px]" title={s.storeName}>{s.storeName}</td>
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{s.ordenes}</td>
                          <td className={`px-3 py-1.5 text-right font-bold ${s.tasaActivacion >= 95 ? 'text-green-700' : s.tasaActivacion >= 90 ? 'text-amber-600' : 'text-red-700'}`}>{s.tasaActivacion}%</td>
                          <td className={`px-3 py-1.5 text-right font-bold ${s.pdHard <= 3 ? 'text-green-700' : s.pdHard <= 8 ? 'text-amber-600' : 'text-red-700'}`}>{s.pdHard}%</td>
                          <td className="px-3 py-1.5"></td>
                          <td className={`px-3 py-1.5 text-right font-bold ${bloqueados > 0 ? 'text-red-700' : 'text-gray-400'}`}>{bloqueados > 0 ? bloqueados : '—'}</td>
                        </tr>,
                        ...(isStoreExp ? s.detalleOrdenes.map(o => (
                          <tr key={o.orderId} className={`border-l-4 ${o.bloqueado ? 'border-l-red-500 bg-red-50/60' : 'border-l-orange-200 bg-orange-50/20'}`}>
                            <td className="px-2 py-1 pl-10"></td>
                            <td className="px-2 py-1 text-gray-400 font-mono">#{o.orderId}</td>
                            <td className="px-3 py-1 font-mono text-gray-700">{o.userDni}</td>
                            <td className="px-3 py-1 text-gray-600 truncate max-w-[120px]" title={o.userName}>{o.userName}</td>
                            <td className="px-3 py-1 text-right text-gray-400">{o.fecha}</td>
                            <td className="px-3 py-1"></td>
                            <td className="px-3 py-1"></td>
                            <td className="px-3 py-1 text-right text-gray-600">{formatearMoneda(o.monto)}</td>
                            <td className={`px-3 py-1 text-right font-bold ${o.bloqueado ? 'text-red-700' : 'text-gray-400'}`}>{o.bloqueado ? 'BLOQ' : o.deviceStatus === 'active' ? 'OK' : o.deviceStatus}</td>
                          </tr>
                        )) : []),
                      ]
                    }) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Alertas 2, 3, 4 en grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* Alerta 2: Cuota 1 > 50% */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Cuota 1 &gt; 50% del equipo</h3>
            <p className="text-[10px] text-gray-400">Anticipo sospechosamente alto. Posible manipulacion de plan.</p>
          </div>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{cuota1.length}</span>
        </div>
        <div className="overflow-auto max-h-[400px]">
          {c1PorMerchant.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin alertas</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Merchant / Orden</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Fecha</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Equipo</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">%C1</th>
                  <th className="text-right px-3 py-2 font-medium text-red-700">Bloq.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {c1PorMerchant.flatMap(m => {
                  const isExp = expandedMerchantC1 === m.clientId
                  return [
                    <tr key={m.clientId} onClick={() => setExpandedMerchantC1(isExp ? null : m.clientId)} className={`cursor-pointer hover:bg-gray-100 font-semibold ${isExp ? 'bg-gray-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{isExp ? '▼' : '▶'}</td>
                      <td className="px-2 py-2 text-gray-900">{m.name} <span className="text-gray-400 font-normal">({m.totalOrdenes})</span></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right text-amber-700 font-bold">{m.avgPct}%</td>
                      <td className={`px-3 py-2 text-right font-bold ${m.bloqueados > 0 ? 'text-red-700' : 'text-gray-400'}`}>{m.bloqueados > 0 ? m.bloqueados : '—'}</td>
                    </tr>,
                    ...(isExp ? m.orders.map(o => (
                      <tr key={o.orderId} className={`border-l-4 ${o.bloqueado ? 'border-l-red-500 bg-red-50/50' : 'border-l-amber-300 bg-amber-50/30'}`}>
                        <td className="px-2 py-1.5"></td>
                        <td className="px-2 py-1.5 text-gray-600 truncate max-w-[200px]" title={o.storeName}>
                          <span className="text-gray-400">#{o.orderId}</span> {o.storeName}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{o.fecha}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700">{formatearMoneda(o.totalOrden)}</td>
                        <td className="px-3 py-1.5 text-right text-red-700 font-bold">{o.pctCuota1}%</td>
                        <td className={`px-3 py-1.5 text-right font-bold ${o.bloqueado ? 'text-red-700' : 'text-gray-400'}`}>{o.bloqueado ? 'BLOQ' : '—'}</td>
                      </tr>
                    )) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Alerta 3: DNI con 2+ ordenes */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Usuarios con 2+ ordenes (DNI)</h3>
            <p className="text-[10px] text-gray-400">Mismo DNI en multiples compras.</p>
          </div>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">{dniUsuarios.length}</span>
        </div>
        <div className="overflow-auto max-h-[400px]">
          {dniUsuarios.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin alertas</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">DNI / Orden</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Nombre / Tienda</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Ord.</th>
                  <th className="text-right px-3 py-2 font-medium text-red-700">Bloq.</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Fecha</th>
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
                      <td className="px-3 py-2 text-gray-700 truncate max-w-[150px]">{u.userName}</td>
                      <td className={`px-3 py-2 text-right font-bold ${u.ordenes >= 3 ? 'text-red-700' : 'text-amber-700'}`}>{u.ordenes}</td>
                      <td className={`px-3 py-2 text-right font-bold ${u.bloqueados > 0 ? 'text-red-700' : 'text-gray-400'}`}>{u.bloqueados > 0 ? u.bloqueados : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{u.primera}</td>
                    </tr>,
                    ...(isExp ? u.detalles.map(d => (
                      <tr key={d.orderId} className={`border-l-4 ${d.bloqueado ? 'border-l-red-500 bg-red-50/50' : 'border-l-purple-300 bg-purple-50/30'}`}>
                        <td className="px-2 py-1.5"></td>
                        <td className="px-2 py-1.5 text-gray-400 font-mono">#{d.orderId}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-[150px]" title={d.storeName}>{d.storeName}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{formatearMoneda(d.monto)}</td>
                        <td className={`px-3 py-1.5 text-right font-bold ${d.bloqueado ? 'text-red-700' : 'text-gray-400'}`}>{d.bloqueado ? 'BLOQ' : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{d.fecha}</td>
                      </tr>
                    )) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Alerta 4: Tiendas con usuarios multi-orden (solo terceros) */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Tiendas terceros con DNI repetido</h3>
            <p className="text-[10px] text-gray-400">Solo terceros. Posible connivencia con vendedores.</p>
          </div>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{dniTiendas.length}</span>
        </div>
        <div className="overflow-auto max-h-[400px]">
          {dniTiendas.length === 0 ? (
            <div className="p-6 text-center text-green-700 text-sm">Sin alertas</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="w-6 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Tienda / Usuario</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Usuarios</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Ord.</th>
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
                      <td className={`px-3 py-2 text-right font-bold ${t.usuariosMulti >= 5 ? 'text-red-700' : t.usuariosMulti >= 3 ? 'text-amber-700' : 'text-gray-900'}`}>{t.usuariosMulti}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{t.ordenesDeMulti}</td>
                      <td className={`px-3 py-2 text-right font-bold ${t.bloqueadosTotal > 0 ? 'text-red-700' : 'text-gray-400'}`}>{t.bloqueadosTotal > 0 ? t.bloqueadosTotal : '—'}</td>
                    </tr>,
                    ...(isExp ? t.usuarios.map(u => (
                      <tr key={`${t.storeName}-${u.userDni}`} className={`border-l-4 ${u.bloqueados > 0 ? 'border-l-red-500 bg-red-50/50' : 'border-l-indigo-300 bg-indigo-50/30'}`}>
                        <td className="px-2 py-1.5"></td>
                        <td className="px-2 py-1.5 text-gray-700">
                          <span className="font-mono text-gray-500 mr-1">DNI {u.userDni}</span> {u.userName}
                        </td>
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
        </div>
      </div>
      </div>
    </div>
  )
}
