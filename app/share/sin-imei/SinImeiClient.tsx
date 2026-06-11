'use client'

import { useState, useMemo } from 'react'
import { formatearMoneda } from '@/lib/utils'
import type { AlertaSinImeiTienda, OrdenConImei } from '@/lib/gocelular'

interface Props {
  tiendas: AlertaSinImeiTienda[]
  ordenesConImei: OrdenConImei[]
  merchant: string
}

export default function SinImeiClient({ tiendas, ordenesConImei, merchant }: Props) {
  const [tab, setTab] = useState<'sin-imei' | 'control'>('sin-imei')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const totalSinImei = tiendas.reduce((s, t) => s + t.sinImei, 0)
  const totalMonto = tiendas.reduce((s, t) => s + t.ordenes.reduce((s2, o) => s2 + o.monto, 0), 0)

  const ordenesFiltradas = useMemo(() => {
    let filtered = ordenesConImei
    if (desde) filtered = filtered.filter(o => o.fecha >= desde)
    if (hasta) filtered = filtered.filter(o => o.fecha <= hasta)
    return filtered
  }, [ordenesConImei, desde, hasta])

  // Agrupar por tienda
  const ordenesPorTienda = useMemo(() => {
    const map = new Map<string, OrdenConImei[]>()
    for (const o of ordenesFiltradas) {
      const arr = map.get(o.storeName) ?? []
      arr.push(o)
      map.set(o.storeName, arr)
    }
    return Array.from(map.entries())
      .map(([storeName, ordenes]) => ({ storeName, ordenes }))
      .sort((a, b) => b.ordenes.length - a.ordenes.length)
  }, [ordenesFiltradas])

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('sin-imei')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'sin-imei' ? 'bg-rose-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          Sin IMEI ({totalSinImei})
        </button>
        <button
          onClick={() => setTab('control')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'control' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          Control de IMEI ({ordenesConImei.length})
        </button>
      </div>

      {tab === 'sin-imei' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Tiendas afectadas</p>
              <p className="text-2xl font-bold text-gray-900">{tiendas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Ordenes sin IMEI</p>
              <p className="text-2xl font-bold text-rose-700">{totalSinImei}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Monto comprometido</p>
              <p className="text-2xl font-bold text-rose-700">{formatearMoneda(totalMonto)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Merchant</p>
              <p className="text-2xl font-bold text-gray-900">{merchant}</p>
            </div>
          </div>

          {tiendas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-green-700 text-sm font-medium">Sin ordenes pendientes de IMEI</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tiendas.map(t => (
                <div key={t.storeName} className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 text-sm">{t.storeName}</h2>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-rose-700 font-bold">{t.sinImei} sin IMEI</span>
                      <span className="text-xs text-gray-500">de {t.total} ordenes</span>
                      <span className="text-xs text-rose-700 font-medium">{formatearMoneda(t.ordenes.reduce((s, o) => s + o.monto, 0))}</span>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-5 py-2 font-medium text-gray-600">Order ID</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">DNI</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Nombre</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-600">Fecha</th>
                        <th className="text-right px-5 py-2 font-medium text-gray-600">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {t.ordenes.map(o => (
                        <tr key={o.orderId} className="hover:bg-gray-50">
                          <td className="px-5 py-2 font-mono text-gray-500 text-xs">{o.orderId}</td>
                          <td className="px-4 py-2 font-mono text-gray-700">{o.userDni}</td>
                          <td className="px-4 py-2 text-gray-700">{o.userName}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{o.fecha}</td>
                          <td className="px-5 py-2 text-right font-medium text-gray-900">{formatearMoneda(o.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'control' && (
        <>
          {/* Filtros de fecha */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Desde</label>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Hasta</label>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              {(desde || hasta) && (
                <button onClick={() => { setDesde(''); setHasta('') }}
                  className="text-xs text-gray-400 hover:text-gray-600">Limpiar filtros</button>
              )}
              <div className="ml-auto text-sm text-gray-500">
                {ordenesFiltradas.length} ordenes · {formatearMoneda(ordenesFiltradas.reduce((s, o) => s + o.monto, 0))}
              </div>
            </div>
          </div>

          {/* KPIs control */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Ordenes con IMEI</p>
              <p className="text-2xl font-bold text-blue-700">{ordenesFiltradas.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Tiendas</p>
              <p className="text-2xl font-bold text-gray-900">{ordenesPorTienda.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Monto total</p>
              <p className="text-2xl font-bold text-blue-700">{formatearMoneda(ordenesFiltradas.reduce((s, o) => s + o.monto, 0))}</p>
            </div>
          </div>

          {ordenesPorTienda.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">Sin ordenes en el rango seleccionado</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ordenesPorTienda.map(({ storeName, ordenes }) => (
                <div key={storeName} className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 text-sm">{storeName}</h2>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-blue-700 font-bold">{ordenes.length} ordenes</span>
                      <span className="text-xs text-gray-500">{formatearMoneda(ordenes.reduce((s, o) => s + o.monto, 0))}</span>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-5 py-2 font-medium text-gray-600">Fecha</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Order ID</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">DNI</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Nombre</th>
                        <th className="text-left px-4 py-2 font-medium text-blue-700 font-semibold">IMEI</th>
                        <th className="text-right px-5 py-2 font-medium text-gray-600">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ordenes.map(o => (
                        <tr key={`${o.orderId}-${o.imei}`} className="hover:bg-gray-50">
                          <td className="px-5 py-2 text-gray-500">{o.fecha}</td>
                          <td className="px-4 py-2 font-mono text-gray-500 text-xs">{o.orderId}</td>
                          <td className="px-4 py-2 font-mono text-gray-700">{o.userDni}</td>
                          <td className="px-4 py-2 text-gray-700">{o.userName}</td>
                          <td className="px-4 py-2 font-mono text-blue-700 font-semibold">{o.imei}</td>
                          <td className="px-5 py-2 text-right font-medium text-gray-900">{formatearMoneda(o.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
