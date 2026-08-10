'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ClienteTransaccional } from '@/lib/actions/grupo-go'

function formatearMoneda(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function formatearNumero(n: number) {
  return new Intl.NumberFormat('es-AR').format(n)
}

export default function TopClientesTable({
  rows,
  cdesde,
  chasta,
}: {
  rows: ClienteTransaccional[]
  cdesde?: string
  chasta?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customDesde, setCustomDesde] = useState(cdesde || '')
  const [customHasta, setCustomHasta] = useState(chasta || '')

  const hoy = new Date()
  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  const hace30 = new Date(hoy)
  hace30.setDate(hace30.getDate() - 30)
  const mesCursoInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const mesAnteriorInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const mesAnteriorFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0)

  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  function navigate(cliDesde?: string, cliHasta?: string) {
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('cdesde')
    sp.delete('chasta')
    if (cliDesde) sp.set('cdesde', cliDesde)
    if (cliHasta) sp.set('chasta', cliHasta)
    router.push(`/grupo-go/dashboard?${sp.toString()}`, { scroll: false })
  }

  const is30d = (!cdesde || cdesde === fmt(hace30)) && !chasta && cdesde !== fmt(mesCursoInicio)
  const isAyer = cdesde === fmt(ayer) && chasta === fmt(ayer)
  const isUltimoMes = cdesde === fmt(mesAnteriorInicio) && chasta === fmt(mesAnteriorFin)
  const isMesCurso = cdesde === fmt(mesCursoInicio) && !chasta
  const isCustom = !is30d && !isAyer && !isUltimoMes && !isMesCurso
  const [showCustom, setShowCustom] = useState(isCustom)

  const pildora = (activa: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded-full border ${
      activa ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
    }`

  const totalTrans = rows.reduce((s, r) => s + r.transacciones, 0)
  const totalComision = rows.reduce((s, r) => s + r.comision, 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Transaccionalidad por cliente</h2>
        <p className="text-sm text-gray-500">Top 50 clientes de GOcuotas por cantidad de operaciones (máximo últimos 12 meses)</p>
      </div>

      {/* Píldoras de filtro */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => navigate(fmt(hace30))} className={pildora(is30d)}>
          Últimos 30 días
        </button>
        <button onClick={() => navigate(fmt(ayer), fmt(ayer))} className={pildora(isAyer)}>
          Ayer
        </button>
        <button onClick={() => navigate(fmt(mesAnteriorInicio), fmt(mesAnteriorFin))} className={pildora(isUltimoMes)}>
          Último mes
        </button>
        <button onClick={() => navigate(fmt(mesCursoInicio))} className={pildora(isMesCurso)}>
          Mes en curso
        </button>
        <button onClick={() => setShowCustom(!showCustom)} className={pildora(isCustom)}>
          Personalizado
        </button>

        {showCustom && (
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
              onClick={() => navigate(customDesde, customHasta)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-gray-900 text-white border-gray-900 hover:bg-gray-700"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Client ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Transacciones</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Comisión ($)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ticket promedio</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Cuotas prom.</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Días para pago</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Sin operaciones en el período seleccionado
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.client_id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-500 tabular-nums">{r.client_id}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                    <span className="font-medium text-gray-900">{r.client_name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900 tabular-nums">{formatearNumero(r.transacciones)}</td>
                <td className="px-4 py-2.5 text-right text-gray-900 tabular-nums">{formatearMoneda(r.comision)}</td>
                <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{formatearMoneda(r.ticket_promedio)}</td>
                <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{r.cuotas_promedio.toFixed(1)}</td>
                <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{r.dias_pago ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-300 bg-gray-50">
              <tr className="font-bold">
                <td className="px-4 py-3 text-gray-900" colSpan={2}>Total top 50</td>
                <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatearNumero(totalTrans)}</td>
                <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatearMoneda(totalComision)}</td>
                <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                  {totalTrans > 0 ? formatearMoneda(rows.reduce((s, r) => s + r.ticket_promedio * r.transacciones, 0) / totalTrans) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                  {totalTrans > 0 ? (rows.reduce((s, r) => s + r.cuotas_promedio * r.transacciones, 0) / totalTrans).toFixed(1) : '—'}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
