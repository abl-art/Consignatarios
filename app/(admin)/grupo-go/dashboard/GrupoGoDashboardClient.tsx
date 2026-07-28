'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GrupoGoData, ChartDayRow } from '@/lib/actions/grupo-go'
import GrupoGoChart from './GrupoGoChart'

function formatearMoneda(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function formatearUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function formatearNumero(n: number) {
  return new Intl.NumberFormat('es-AR').format(n)
}

const COLORES: Record<string, string> = {
  GOcuotas: 'bg-blue-600',
  GOPremium: 'bg-purple-600',
  GOAdelantos: 'bg-emerald-600',
  GOTarjeta: 'bg-amber-600',
  GOBig: 'bg-rose-600',
  GOQr: 'bg-indigo-600',
  GOPlus: 'bg-teal-600',
  GOcelular: 'bg-orange-600',
}

const COLORES_BADGE: Record<string, string> = {
  GOcuotas: 'bg-blue-100 text-blue-700',
  GOPremium: 'bg-purple-100 text-purple-700',
  GOAdelantos: 'bg-emerald-100 text-emerald-700',
  GOTarjeta: 'bg-amber-100 text-amber-700',
  GOBig: 'bg-rose-100 text-rose-700',
  GOQr: 'bg-indigo-100 text-indigo-700',
  GOPlus: 'bg-teal-100 text-teal-700',
  GOcelular: 'bg-orange-100 text-orange-700',
}

export default function GrupoGoDashboardClient({
  data,
  desde,
  hasta,
  chartData,
}: {
  data: GrupoGoData
  desde?: string
  hasta?: string
  chartData: ChartDayRow[]
}) {
  const router = useRouter()
  const [customDesde, setCustomDesde] = useState(desde || '')
  const [customHasta, setCustomHasta] = useState(hasta || '')

  const hoy = new Date()
  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  const hace30 = new Date(hoy)
  hace30.setDate(hace30.getDate() - 30)

  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v)
    }
    router.push(`/grupo-go/dashboard?${sp.toString()}`)
  }

  const anioActual = `${hoy.getFullYear()}-01-01`

  const isAyer = desde === fmt(ayer) && hasta === fmt(ayer)
  const is30d = desde === fmt(hace30) && !hasta
  const isAnio = desde === anioActual && !hasta
  const isTodo = !desde && !hasta
  const isCustom = !isAyer && !is30d && !isAnio && !isTodo

  const totalCantidad = data.total_cantidad
  const totalMonto = data.total_monto

  return (
    <div className="space-y-6">
      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate({ desde: fmt(ayer), hasta: fmt(ayer) })}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
            isAyer ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Ayer
        </button>
        <button
          onClick={() => navigate({ desde: fmt(hace30) })}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
            is30d ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Últimos 30 días
        </button>
        <button
          onClick={() => navigate({ desde: anioActual })}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
            isAnio ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Año en curso
        </button>
        <button
          onClick={() => navigate({})}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
            isTodo ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Todo
        </button>

        <div className="flex items-center gap-2 ml-2">
          <input
            type="date"
            value={customDesde}
            onChange={(e) => setCustomDesde(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
          />
          <span className="text-xs text-gray-400">—</span>
          <input
            type="date"
            value={customHasta}
            onChange={(e) => setCustomHasta(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
          />
          <button
            onClick={() => navigate({ desde: customDesde, hasta: customHasta })}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-gray-900 text-white border-gray-900 hover:bg-gray-700"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Chart */}
      <GrupoGoChart data={chartData} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Operaciones</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatearNumero(totalCantidad)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Monto total</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatearMoneda(totalMonto)}</p>
          <p className="text-sm text-gray-400 mt-1">{formatearUSD(Math.round(totalMonto / data.tipo_cambio))}</p>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-5">
          <p className="text-xs text-green-600 uppercase tracking-wide">Facturación neta</p>
          <p className="text-2xl font-bold text-green-700 mt-2">{formatearMoneda(data.facturacion)}</p>
          <p className="text-sm text-green-500 mt-1">{formatearUSD(Math.round(data.facturacion / data.tipo_cambio))}</p>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-5">
          <p className="text-xs text-blue-600 uppercase tracking-wide">Usuarios registrados</p>
          <p className="text-2xl font-bold text-blue-700 mt-2">{formatearNumero(data.usuarios_registrados)}</p>
        </div>
        <div className="bg-white border border-purple-200 rounded-xl p-5">
          <p className="text-xs text-purple-600 uppercase tracking-wide">Usuarios activados</p>
          <p className="text-2xl font-bold text-purple-700 mt-2">{formatearNumero(data.usuarios_activados)}</p>
          <p className="text-xs text-gray-400 mt-1">Primera operación en el período</p>
        </div>
      </div>

      {/* Per-model cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.modelos.map(m => {
          const pctCant = data.total_cantidad > 0 ? (m.cantidad / data.total_cantidad * 100) : 0
          const pctMonto = data.total_monto > 0 ? (m.monto / data.total_monto * 100) : 0
          return (
            <div key={m.modelo} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className={`${COLORES[m.modelo] || 'bg-gray-600'} px-4 py-3`}>
                <h3 className="text-sm font-semibold text-white">{m.modelo}</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-baseline">
                  <div>
                    <p className="text-xs text-gray-500">Operaciones</p>
                    <p className="text-xl font-bold text-gray-900">{formatearNumero(m.cantidad)}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${COLORES_BADGE[m.modelo] || 'bg-gray-100 text-gray-700'}`}>
                    {pctCant.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <div>
                    <p className="text-xs text-gray-500">Monto</p>
                    <p className="text-lg font-bold text-gray-900">{formatearMoneda(m.monto)}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${COLORES_BADGE[m.modelo] || 'bg-gray-100 text-gray-700'}`}>
                    {pctMonto.toFixed(1)}%
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-2">
                  <p className="text-xs text-gray-500">Nuevos usuarios</p>
                  <p className="text-lg font-bold text-gray-900">{formatearNumero(m.usuarios_activados)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Operaciones</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">% Cant</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Monto</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">% Monto</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Ticket promedio</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Nuevos usuarios</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.modelos.map(m => {
              const pctCant = data.total_cantidad > 0 ? (m.cantidad / data.total_cantidad * 100) : 0
              const pctMonto = data.total_monto > 0 ? (m.monto / data.total_monto * 100) : 0
              const ticket = m.cantidad > 0 ? m.monto / m.cantidad : 0
              return (
                <tr key={m.modelo} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${COLORES[m.modelo] || 'bg-gray-600'}`} />
                      <span className="font-medium text-gray-900">{m.modelo}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right text-gray-900 font-medium">{formatearNumero(m.cantidad)}</td>
                  <td className="px-6 py-3 text-right text-gray-500">{pctCant.toFixed(1)}%</td>
                  <td className="px-6 py-3 text-right text-gray-900 font-medium">{formatearMoneda(m.monto)}</td>
                  <td className="px-6 py-3 text-right text-gray-500">{pctMonto.toFixed(1)}%</td>
                  <td className="px-6 py-3 text-right text-gray-700">{formatearMoneda(ticket)}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{formatearNumero(m.usuarios_activados)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50">
            <tr className="font-bold">
              <td className="px-6 py-3 text-gray-900">Total Grupo GO</td>
              <td className="px-6 py-3 text-right text-gray-900">{formatearNumero(totalCantidad)}</td>
              <td className="px-6 py-3 text-right text-gray-500">100%</td>
              <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(totalMonto)}</td>
              <td className="px-6 py-3 text-right text-gray-500">100%</td>
              <td className="px-6 py-3 text-right text-gray-700">{totalCantidad > 0 ? formatearMoneda(totalMonto / totalCantidad) : '$0'}</td>
              <td className="px-6 py-3 text-right text-gray-700">{formatearNumero(data.usuarios_activados)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
