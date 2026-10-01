'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useState } from 'react'
import CanalPills, { type Canal } from '@/app/(admin)/finanzas/CanalPills'
import type { CanalPartner, DatosPartnerSamsung } from '@/lib/actions/partner-samsung'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function nombreMes(ym: string): string {
  const [a, m] = ym.split('-').map(Number)
  return `${MESES[m - 1]} ${String(a).slice(2)}`
}

function pct(n: number): string {
  return (n * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%'
}

function rango(a: number, b: number): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  if (lo === hi) return lo.toLocaleString('es-AR')
  return `${lo.toLocaleString('es-AR')} – ${hi.toLocaleString('es-AR')}`
}

const NOMBRE_CANAL: Record<CanalPartner, string> = {
  total: 'venta total',
  propia: 'tienda propia',
  terceros: 'venta de terceros',
}

export default function SamsungClient({ datos: todos }: { datos: Record<CanalPartner, DatosPartnerSamsung | null> }) {
  // El acuerdo aplica a la venta propia: es el canal por defecto
  const [canal, setCanal] = useState<Canal>('propia')
  const datos = todos[canal]
  if (!datos) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Sin datos para este canal.
      </div>
    )
  }
  const { escenarios, ranking, historico, shareFijo, shareActual, muestraActual } = datos

  // Gráfico: real Samsung (contexto jun-sep) + proyección en dos escenarios
  // (promedio de ambos métodos como línea, el detalle por método vive en la tabla)
  const dataChart = [
    ...historico.map(h => ({ mes: nombreMes(h.mes), real: h.samsung })),
    ...escenarios.map(e => ({
      mes: nombreMes(e.mes),
      preAcuerdo: Math.round((e.fijoHibrido + e.fijoGocuotas) / 2),
      conAcuerdo: Math.round((e.actualHibrido + e.actualGocuotas) / 2),
    })),
  ]

  const totalPeriodo = (campoA: 'fijoHibrido' | 'actualHibrido', campoB: 'fijoGocuotas' | 'actualGocuotas') => {
    const a = escenarios.reduce((s, e) => s + e[campoA], 0)
    const b = escenarios.reduce((s, e) => s + e[campoB], 0)
    return rango(a, b)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1428a0] text-white px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold">GOcelular · Plan Samsung</h1>
          <p className="text-sm text-blue-200">
            Proyección de unidades Samsung en {NOMBRE_CANAL[canal]} — acuerdo vigente desde el 1/10/2026.
            Actualizado en cada visita con las ventas reales.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <div className="mb-4">
          <CanalPills canal={canal} onChange={setCanal} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Share hasta el 30/9 (jul-sep)</p>
            <p className="text-2xl font-bold text-gray-900">{pct(shareFijo)}</p>
            <p className="text-xs text-gray-400">base fija pre-acuerdo</p>
          </div>
          <div className="bg-white border border-[#1428a0]/30 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Share desde el 1/10</p>
            <p className="text-2xl font-bold text-[#1428a0]">{pct(shareActual)}</p>
            <p className="text-xs text-gray-400">
              {muestraActual.total > 0
                ? `${muestraActual.samsung.toLocaleString('es-AR')} de ${muestraActual.total.toLocaleString('es-AR')} ventas`
                : 'sin ventas aún — se usa la base fija'}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Plan {escenarios.length} meses · share pre-acuerdo</p>
            <p className="text-xl font-bold text-gray-700">{totalPeriodo('fijoHibrido', 'fijoGocuotas')}</p>
            <p className="text-xs text-gray-400">unidades Samsung</p>
          </div>
          <div className="bg-white border border-[#1428a0]/30 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Plan {escenarios.length} meses · share actual</p>
            <p className="text-xl font-bold text-[#1428a0]">{totalPeriodo('actualHibrido', 'actualGocuotas')}</p>
            <p className="text-xs text-gray-400">unidades Samsung</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">
            Unidades Samsung por mes — real y proyección en dos escenarios
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dataChart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => (typeof v === 'number' ? v.toLocaleString('es-AR') : String(v ?? ''))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="real" name="Real" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Line dataKey="preAcuerdo" name="Proyección share hasta 30/9" stroke="#9ca3af" strokeDasharray="6 4" strokeWidth={2} dot />
                <Line dataKey="conAcuerdo" name="Proyección share desde 1/10" stroke="#1428a0" strokeWidth={2.5} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Las líneas muestran el promedio de los dos métodos de proyección de GOcelular; el rango por
            método está en la tabla. El escenario &quot;desde 1/10&quot; usa el share real acumulado del
            acuerdo y se recalcula con cada venta.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="text-left px-4 py-3">Mes</th>
                <th className="text-right px-4 py-3" title="Proyección con el share fijo jul-sep — rango entre los dos métodos">
                  Share hasta 30/9 ({pct(shareFijo)})
                </th>
                <th className="text-right px-4 py-3" title="Proyección con el share real desde el 1/10 — rango entre los dos métodos">
                  Share desde 1/10 ({pct(shareActual)})
                </th>
                <th className="text-right px-4 py-3">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {escenarios.map(e => {
                const difProm = Math.round((e.actualHibrido + e.actualGocuotas - e.fijoHibrido - e.fijoGocuotas) / 2)
                return (
                  <tr key={e.mes}>
                    <td className="px-4 py-2.5 font-medium">{nombreMes(e.mes)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{rango(e.fijoHibrido, e.fijoGocuotas)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#1428a0]">{rango(e.actualHibrido, e.actualGocuotas)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${difProm >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {difProm >= 0 ? '+' : ''}{difProm.toLocaleString('es-AR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <div className="px-4 pt-4">
            <h2 className="font-semibold text-gray-900 text-sm">
              Ranking de modelos Samsung (últimos 90 días) y plan mensual con el share vigente
            </h2>
            <p className="text-xs text-gray-400 mb-2">
              Plan mensual = proyección Samsung con el share desde el 1/10 × participación del modelo.
              Rango entre los dos métodos de proyección.
            </p>
          </div>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Modelo</th>
                <th className="text-right px-4 py-3">Unidades 90d</th>
                <th className="text-right px-4 py-3">Mix Samsung</th>
                <th className="text-right px-4 py-3">Plan mensual (share 1/10)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ranking.map((m, i) => (
                <tr key={m.modelo}>
                  <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{m.modelo}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.unidades90d.toLocaleString('es-AR')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{pct(m.mix)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#1428a0]">
                    {rango(m.planMensualHibrido, m.planMensualGocuotas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          GOcelular · información confidencial para Samsung Argentina — proyecciones congeladas del run{' '}
          {datos.runMes}, share y ranking recalculados en vivo sobre ventas confirmadas de la tienda propia.
        </p>
      </div>
    </div>
  )
}
