'use client'

import { useState } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { esFinde, letraDia } from '@/lib/dias-habiles'
import type { FlujoDiario, CuotasStats } from '@/lib/flujo-canal'
import type { DeudaPrestamo } from '@/lib/types'
import CanalPills, { type Canal } from './CanalPills'
import CashBalanceChart from './CashBalanceChart'
import DeudaBalanceChart from './DeudaBalanceChart'
import { CargarAsistenciaButton, CargarEgresoButton, ProyeccionButton } from './FinanzasActions'

export interface CanalFlujo {
  flujo: FlujoDiario[]
  stats: CuotasStats
}

interface Props {
  canales: { total: CanalFlujo; propia: CanalFlujo; terceros: CanalFlujo }
  prestamos: DeudaPrestamo[]
  limiteDeuda: number
  proyeccionDiaria: number
  mesSeleccionado: string
  meses: string[]
}

const NOTA_CANAL: Record<Canal, string | null> = {
  total: null,
  propia: 'Cuotas de venta propia + asistencias, mayoristas, proyección y todos los egresos salvo V3',
  terceros: 'Solo cuotas de terceros que ingresan + egreso Venta Terceros (V3)',
}

function formatFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00')
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtCompact(v: number) {
  if (v === 0) return ''
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + Math.round(abs / 1_000) + 'K'
  return sign + Math.round(abs).toString()
}

export default function FlujoTab({ canales, prestamos, limiteDeuda, proyeccionDiaria, mesSeleccionado, meses }: Props) {
  const [canal, setCanal] = useState<Canal>('total')
  const { flujo, stats: cuotasStats } = canales[canal]
  const nota = NOTA_CANAL[canal]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <CanalPills canal={canal} onChange={setCanal} />
        {nota && <p className="text-xs text-gray-400">{nota}</p>}
      </div>

      {/* Cuotas vencidas stats - individual cards */}
      <p className="text-xs text-gray-400 mb-2">Cuotas vencidas: {cuotasStats.total.toLocaleString('es-AR')}</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">Adelantado</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-emerald-600">{cuotasStats.pct_adelantado.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.adelantado.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-emerald-700 mt-1">{formatearMoneda(cuotasStats.monto_adelantado)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">En término</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-green-600">{cuotasStats.pct_en_termino.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.en_termino.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-green-700 mt-1">{formatearMoneda(cuotasStats.monto_en_termino)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">Recupero de mora</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-yellow-600">{cuotasStats.pct_atrasado.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.atrasado.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-yellow-700 mt-1">{formatearMoneda(cuotasStats.monto_atrasado)}</p>
          <p className="text-xs text-gray-500 mt-1">PPP Recupero: <span className="font-bold text-gray-700">{cuotasStats.ppp_recupero} días</span></p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">En mora</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-red-600">{cuotasStats.pct_mora.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.mora.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-red-700 mt-1">{formatearMoneda(cuotasStats.monto_mora)}</p>
          <p className="text-xs text-gray-500 mt-1">PPP Mora: <span className="font-bold text-red-700">{cuotasStats.ppp_mora} días</span></p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">Incobrables</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-red-700">{cuotasStats.pct_contracargos.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.contracargos.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-red-700 mt-1">{formatearMoneda(cuotasStats.monto_contracargos)}</p>
          <p className="text-xs text-red-500 mt-1">Contracargos + mora 120+ días + transición 30+ días</p>
        </div>
      </div>

      {/* Cash balance chart */}
      <CashBalanceChart data={flujo.map(r => ({ cash_date: r.cash_date, cash_balance: r.cash_balance }))} />
      <DeudaBalanceChart data={flujo.map(r => ({ cash_date: r.cash_date, cash_balance: r.cash_balance }))} prestamos={prestamos} limite={limiteDeuda} />

      {/* Action buttons and filter */}
      <div className="flex flex-wrap gap-3 items-end mb-6">
        <CargarAsistenciaButton />
        <CargarEgresoButton />
        <ProyeccionButton valorActual={proyeccionDiaria} />
        <form method="GET" className="flex items-end gap-3 ml-auto">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Mes</label>
            <select
              name="mes"
              defaultValue={mesSeleccionado}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {meses.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            Filtrar
          </button>
        </form>
      </div>

      {/* Cash flow table */}
      {flujo.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Sin datos de flujo de fondos para este período.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-8">
          <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="text-center px-1 py-2.5 font-semibold text-gray-500 w-[26px]" title="Día de la semana">D</th>
                  <th className="text-left px-1.5 py-2.5 font-semibold text-gray-500 w-[56px]">Fecha</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-green-600">Adel</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-green-600">Térm</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-green-600">Atr</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-green-600">Pend</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-green-600">Asist</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-green-600">May</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-blue-500">Proy</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">Cel</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">Lic</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">Dsc</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">Suel</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">Env</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">Int</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">Otr</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">V3</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-red-600">DCp</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-gray-700">Neto</th>
                  <th className="text-right px-1.5 py-2.5 font-semibold text-gray-700">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {flujo.map((row, i) => {
                  const hoy = new Date().toISOString().slice(0, 10)
                  const esHoy = row.cash_date === hoy
                  return (
                  <tr key={i} className={`hover:bg-gray-50 ${esHoy ? 'bg-yellow-100' : ''}`}>
                    <td className={`px-1 py-2 text-center font-bold ${esFinde(row.cash_date) ? 'text-amber-600' : 'text-gray-400'}`}>
                      {letraDia(row.cash_date)}
                    </td>
                    <td className="px-1.5 py-2 text-gray-700 font-medium whitespace-nowrap">{formatFecha(row.cash_date)}</td>
                    <td className="px-1.5 py-2 text-right text-green-700">{fmtCompact(row.in_adelantado)}</td>
                    <td className="px-1.5 py-2 text-right text-green-700">{fmtCompact(row.in_en_termino)}</td>
                    <td className="px-1.5 py-2 text-right text-green-700">{fmtCompact(row.in_atrasado)}</td>
                    <td className="px-1.5 py-2 text-right text-green-700">{fmtCompact(row.in_pendiente)}</td>
                    <td className="px-1.5 py-2 text-right text-green-700">{fmtCompact(row.in_asistencia)}</td>
                    <td className="px-1.5 py-2 text-right text-green-700">{fmtCompact(row.in_mayoristas)}</td>
                    <td className="px-1.5 py-2 text-right text-blue-600">{fmtCompact(row.in_proyectado)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_celulares)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_licencias)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_descartables)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_sueldos)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_envios)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_interes)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_otros)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_vta3ero)}</td>
                    <td className="px-1.5 py-2 text-right text-red-700">{fmtCompact(row.out_dev_capital)}</td>
                    <td className={`px-1.5 py-2 text-right font-bold ${row.net_flow >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtCompact(row.net_flow)}</td>
                    <td className={`px-1.5 py-2 text-right font-bold ${row.cash_balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtCompact(row.cash_balance)}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
