'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface PDRow {
  mes: string
  cuota: number
  pd_hard: number
  pd_30: number
}

interface PDResumen {
  cuota: number
  pd_hard: number
  pd_30: number
}

interface Props {
  byOrigination: PDRow[]
  byDueMonth: PDRow[]
  resumen: PDResumen[]
  maxCuota: number
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatMes(mes: string): string {
  const parts = mes.split('-')
  if (parts.length >= 2) {
    const y = parts[0].slice(-2)
    const m = parseInt(parts[1], 10) - 1
    return `${MONTH_NAMES[m] ?? parts[1]}-${y}`
  }
  return mes
}

function formatPd(value: number): string {
  return `${value.toFixed(1)}%`
}

function pdColor(value: number): string {
  if (value <= 25) return 'text-green-600'
  if (value <= 50) return 'text-yellow-600'
  return 'text-red-600'
}

function PDTable({ rows }: { rows: PDRow[] }) {
  return (
    <div className="max-h-[300px] overflow-auto border border-gray-200 rounded-xl">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gray-50 z-10">
          <tr>
            <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">Mes</th>
            <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">PD Hard</th>
            <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">PD30</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.mes} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-1.5 text-gray-700">{formatMes(row.mes)}</td>
              <td className={`px-3 py-1.5 text-right font-medium ${pdColor(row.pd_hard)}`}>{formatPd(row.pd_hard)}</td>
              <td className={`px-3 py-1.5 text-right font-medium ${pdColor(row.pd_30)}`}>{formatPd(row.pd_30)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PDChart({ rows }: { rows: PDRow[] }) {
  const data = rows.map((r) => ({ mes: formatMes(r.mes), pd_hard: r.pd_hard, pd_30: r.pd_30 }))
  return (
    <div className="w-full h-56 mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
          <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            formatter={(value) => [`${Number(value).toFixed(1)}%`]}
            labelStyle={{ color: '#374151' }}
            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
          />
          <Legend />
          <Line type="monotone" dataKey="pd_hard" name="PD Hard" stroke="#EF4444" strokeWidth={2} dot={{ r: 4, fill: '#EF4444' }} />
          <Line type="monotone" dataKey="pd_30" name="PD30" stroke="#F97316" strokeWidth={2} dot={{ r: 4, fill: '#F97316' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function IndicadoresTab({ byOrigination, byDueMonth, resumen, maxCuota }: Props) {
  const [selectedCuota, setSelectedCuota] = useState(2)

  const cuotas = Array.from({ length: maxCuota }, (_, i) => i + 1)

  const filteredOrig = useMemo(
    () => byOrigination.filter((r) => r.cuota === selectedCuota),
    [byOrigination, selectedCuota],
  )

  const filteredDue = useMemo(
    () => byDueMonth.filter((r) => r.cuota === selectedCuota),
    [byDueMonth, selectedCuota],
  )

  return (
    <div className="space-y-6">
      {/* Summary card - FPD for all cuotas */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Payment Default por cuota</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-gray-500 font-medium"></th>
                {cuotas.map((c) => (
                  <th key={c} className="px-2 py-1 text-center text-gray-600 font-bold">C{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1.5 font-semibold text-red-600 whitespace-nowrap">PD Hard</td>
                {cuotas.map((c) => {
                  const r = resumen.find((x) => x.cuota === c)
                  const v = r?.pd_hard ?? 0
                  return <td key={c} className={`px-2 py-1.5 text-center font-bold ${pdColor(v)}`}>{formatPd(v)}</td>
                })}
              </tr>
              <tr>
                <td className="px-2 py-1.5 font-semibold text-orange-600 whitespace-nowrap">PD 30</td>
                {cuotas.map((c) => {
                  const r = resumen.find((x) => x.cuota === c)
                  const v = r?.pd_30 ?? 0
                  return <td key={c} className={`px-2 py-1.5 text-center font-bold ${pdColor(v)}`}>{formatPd(v)}</td>
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cuota selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-medium text-gray-600 mb-2">Detalle por cuota</p>
        <div className="flex flex-wrap gap-2">
          {cuotas.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCuota(c)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                selectedCuota === c
                  ? 'bg-magenta-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Cuota {c}
            </button>
          ))}
        </div>
      </div>

      {/* Two columns: origination and due month */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Por originación — Cuota {selectedCuota}</h3>
          {filteredOrig.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">Sin datos</p>
          ) : (
            <>
              <PDTable rows={filteredOrig} />
              <PDChart rows={filteredOrig} />
            </>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Por vencimiento — Cuota {selectedCuota}</h3>
          {filteredDue.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">Sin datos</p>
          ) : (
            <>
              <PDTable rows={filteredDue} />
              <PDChart rows={filteredDue} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
