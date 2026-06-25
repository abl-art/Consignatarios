'use client'

import { useState } from 'react'
import type { ResultadoTercerosData } from '@/lib/actions/resultado-terceros'

function fmt(n: number): string { return n.toLocaleString('es-AR') }
function fmtPesos(n: number): string { return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function fmtPct(n: number): string { return n.toFixed(1) + '%' }

const FILAS: { key: string; label: string; format: 'pesos' | 'number' | 'pct' | 'usd'; bold?: boolean; separator?: boolean; note?: string }[] = [
  { key: 'unidades', label: 'Unidades vendidas', format: 'number' },
  { key: 'order_amount_total', label: 'Monto total orders', format: 'pesos' },
  { key: 'revenue_gocuotas', label: 'Revenue GOcuotas (comisión)', format: 'pesos', bold: true, separator: true },
  { key: 'licencias_bloqueo', label: 'Licencias de bloqueo', format: 'pesos' },
  { key: 'sueldos', label: 'Sueldos', format: 'pesos' },
  { key: 'adquirencia', label: 'Adquirencia', format: 'pesos' },
  { key: 'incobrables', label: 'Incobrables', format: 'pesos' },
  { key: 'intereses', label: 'Intereses', format: 'pesos' },
  { key: 'impuestos', label: 'Impuestos *', format: 'pesos', note: 'impuestos' },
  { key: 'contribucion_neta', label: 'Contribución Neta', format: 'pesos', bold: true, separator: true },
  { key: 'rentabilidad_revenue', label: 'Rentabilidad s/revenue', format: 'pct' },
  { key: 'ganancia', label: 'Ganancia total', format: 'pesos', bold: true, separator: true },
  { key: 'ganancia_usd', label: 'Ganancia en USD', format: 'usd', bold: true },
]

export default function ResultadoTercerosTable({ data }: { data: ResultadoTercerosData }) {
  const [showMerchants, setShowMerchants] = useState(false)
  const { merchants, totals, config } = data

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button onClick={() => setShowMerchants(!showMerchants)}
        className="w-full px-5 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <h3 className="text-sm font-semibold text-gray-700">Estado de Resultado — Venta Terceros</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{showMerchants ? 'Por merchant' : 'Total'}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showMerchants ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[180px]">Concepto</th>
              {showMerchants && merchants.map(m => (
                <th key={m.client_id} className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 min-w-[110px]">
                  {m.merchant_name}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 min-w-[120px] bg-gray-100">Total</th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map(fila => {
              const isGanancia = fila.key === 'ganancia' || fila.key === 'ganancia_usd'
              const isRevenue = fila.key === 'revenue_gocuotas'
              return (
                <tr key={fila.key} className={`border-b ${fila.separator ? 'border-gray-200' : 'border-gray-50'} ${fila.bold ? 'bg-gray-50' : ''} ${isGanancia ? 'bg-emerald-50' : ''}`}>
                  <td className={`px-4 py-2 text-xs sticky left-0 ${fila.bold ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-600'} ${isGanancia ? 'font-bold text-emerald-800 bg-emerald-50' : ''} ${isRevenue ? 'font-semibold text-blue-800 bg-blue-50' : ''}`}>
                    {fila.label}
                  </td>
                  {showMerchants && merchants.map(m => {
                    const val = (m as unknown as Record<string, number>)[fila.key] ?? 0
                    return (
                      <td key={m.client_id} className={`px-3 py-2 text-right font-mono text-xs ${fila.bold ? 'font-semibold' : ''} ${isGanancia ? 'font-bold text-emerald-700' : ''} ${isRevenue ? 'font-semibold text-blue-700' : ''} ${val < 0 ? 'text-red-500' : ''}`}>
                        {fila.format === 'pesos' ? fmtPesos(val) : fila.format === 'usd' ? 'US$ ' + fmt(val) : fila.format === 'pct' ? fmtPct(val) : fmt(val)}
                      </td>
                    )
                  })}
                  <td className={`px-3 py-2 text-right font-mono text-xs font-semibold bg-gray-100 ${isGanancia ? 'text-emerald-700 font-bold' : ''} ${isRevenue ? 'text-blue-700 font-bold' : ''}`}>
                    {(() => {
                      const k = fila.key
                      const totalVal = (totals as Record<string, number>)[k]
                      if (k === 'rentabilidad_revenue') return fmtPct(totals.revenue_gocuotas > 0 ? (totals.contribucion_neta / totals.revenue_gocuotas) * 100 : 0)
                      if (totalVal === undefined) return ''
                      if (fila.format === 'usd') return 'US$ ' + fmt(totalVal)
                      if (fila.format === 'number') return fmt(totalVal)
                      if (fila.format === 'pct') return fmtPct(totalVal)
                      return fmtPesos(totalVal)
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-[11px] text-gray-400">* Impuestos: IIBB ({config.iibb}%) + Com e Ind ({config.com_e_ind}%) sobre revenue GOcuotas + Déb/Créd (1,2%) sobre monto total orders. Comisión al comercio: {config.comision_terceros}%. Liquidación: {config.liquidacion_1_pct}% a {config.liquidacion_1_dias}d + {config.liquidacion_2_pct}% a {config.liquidacion_2_dias}d.</p>
      </div>
    </div>
  )
}
