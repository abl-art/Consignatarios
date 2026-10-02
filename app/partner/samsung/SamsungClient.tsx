'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useState } from 'react'
import CanalPills, { type Canal } from '@/app/(admin)/finanzas/CanalPills'
import type { CanalPartner, DatosPartnerSamsung, SkuVendido } from '@/lib/actions/partner-samsung'
import PieMarcas from './PieMarcas'

const PERIODOS_SKU = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'd7', label: '7 días' },
  { key: 'd30', label: '30 días' },
  { key: 'mes', label: 'Este mes' },
] as const
type PeriodoSku = (typeof PERIODOS_SKU)[number]['key'] | 'custom'

function fmtCant(v: unknown): string {
  return typeof v === 'number' ? v.toLocaleString('es-AR') : ''
}

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
  const [periodoSku, setPeriodoSku] = useState<PeriodoSku>('hoy')
  const [rangoFechas, setRangoFechas] = useState({ desde: '', hasta: '' })
  const [filasRango, setFilasRango] = useState<{ sku: string; unidades: number }[] | null>(null)
  const [cargandoRango, setCargandoRango] = useState(false)
  const datos = todos[canal]
  // Los SKUs vendidos son de la tienda propia (alcance del acuerdo)
  const skus: SkuVendido[] = todos.propia?.skusSamsung ?? []

  async function aplicarRango() {
    if (!rangoFechas.desde || !rangoFechas.hasta) return
    setCargandoRango(true)
    try {
      const token = new URLSearchParams(window.location.search).get('token') ?? ''
      const res = await fetch(
        `/partner/samsung/skus?token=${encodeURIComponent(token)}&desde=${rangoFechas.desde}&hasta=${rangoFechas.hasta}`
      )
      const json = await res.json()
      setFilasRango(Array.isArray(json.skus) ? json.skus : [])
    } catch {
      setFilasRango([])
    } finally {
      setCargandoRango(false)
    }
  }
  if (!datos) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Sin datos para este canal.
      </div>
    )
  }
  const { escenarios, historico, shareFijo, shareActual, muestraActual, marcasFijo, marcasActual } = datos

  // Gráfico: real Samsung (jun → hoy; la barra del mes en curso se va
  // completando con el acumulado) + proyección en dos escenarios (promedio de
  // ambos métodos como línea, el detalle por método vive en la tabla).
  // Una fila por mes: en el mes actual conviven barra real y proyecciones.
  const porMesChart = new Map<string, { mes: string; real?: number; preAcuerdo?: number; conAcuerdo?: number }>()
  for (const h of historico) porMesChart.set(h.mes, { mes: h.mes, real: h.samsung })
  for (const e of escenarios) {
    const fila = porMesChart.get(e.mes) ?? { mes: e.mes }
    fila.preAcuerdo = Math.round((e.fijoHibrido + e.fijoGocuotas) / 2)
    fila.conAcuerdo = Math.round((e.actualHibrido + e.actualGocuotas) / 2)
    porMesChart.set(e.mes, fila)
  }
  const dataChart = [...porMesChart.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(f => ({ ...f, mes: nombreMes(f.mes) }))

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
              {muestraActual.conMarca > 0
                ? `${muestraActual.samsung.toLocaleString('es-AR')} de ${muestraActual.conMarca.toLocaleString('es-AR')} ventas`
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
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Share de ventas por marca</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <PieMarcas titulo="Hasta el 30/9" subtitulo="jul – sep 2026, base del acuerdo" data={marcasFijo} />
            <PieMarcas titulo="Desde el 1/10" subtitulo="acumulado del acuerdo, en vivo" data={marcasActual} />
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
                <Bar dataKey="real" name="Real" fill="#94a3b8" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="real" position="top" formatter={fmtCant} style={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} />
                </Bar>
                <Line dataKey="preAcuerdo" name="Proyección share hasta 30/9" stroke="#9ca3af" strokeDasharray="6 4" strokeWidth={2} dot>
                  <LabelList dataKey="preAcuerdo" position="bottom" formatter={fmtCant} style={{ fontSize: 10, fill: '#9ca3af' }} />
                </Line>
                <Line dataKey="conAcuerdo" name="Proyección share desde 1/10" stroke="#1428a0" strokeWidth={2.5} dot>
                  <LabelList dataKey="conAcuerdo" position="top" formatter={fmtCant} style={{ fontSize: 10, fill: '#1428a0', fontWeight: 600 }} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Las líneas muestran el promedio de los dos métodos de proyección de GOcelular; el rango por
            método está en la tabla. El escenario &quot;desde 1/10&quot; usa el share real acumulado del
            acuerdo y se recalcula con cada venta (por fecha de venta, marca del producto vendido).
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
            <h2 className="font-semibold text-gray-900 text-sm">SKUs Samsung vendidos — tienda propia</h2>
            <p className="text-xs text-gray-400">Unidades por SKU según la fecha de la venta, actualizado en cada visita.</p>
            <div className="flex flex-wrap items-center gap-1 mt-2 mb-3">
              {PERIODOS_SKU.map(p => (
                <button key={p.key} onClick={() => setPeriodoSku(p.key)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${periodoSku === p.key ? 'bg-[#1428a0] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => setPeriodoSku('custom')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${periodoSku === 'custom' ? 'bg-[#1428a0] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Personalizado
              </button>
              {periodoSku === 'custom' && (
                <span className="flex items-center gap-1 ml-1">
                  <input type="date" value={rangoFechas.desde} max={rangoFechas.hasta || undefined}
                    onChange={e => setRangoFechas(r => ({ ...r, desde: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-1.5 py-0.5 text-[11px] text-gray-700" />
                  <span className="text-[11px] text-gray-400">→</span>
                  <input type="date" value={rangoFechas.hasta} min={rangoFechas.desde || undefined}
                    onChange={e => setRangoFechas(r => ({ ...r, hasta: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-1.5 py-0.5 text-[11px] text-gray-700" />
                  <button onClick={aplicarRango} disabled={!rangoFechas.desde || !rangoFechas.hasta || cargandoRango}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[#1428a0] text-white disabled:opacity-40">
                    {cargandoRango ? '...' : 'Aplicar'}
                  </button>
                </span>
              )}
            </div>
          </div>
          {(() => {
            const filas: { sku: string; unidades: number }[] =
              periodoSku === 'custom'
                ? (filasRango ?? [])
                : skus
                    .filter(s => s[periodoSku] > 0)
                    .sort((a, b) => b[periodoSku] - a[periodoSku])
                    .map(s => ({ sku: s.sku, unidades: s[periodoSku] }))
            const totalPeriodoSku = filas.reduce((a, s) => a + s.unidades, 0)
            if (periodoSku === 'custom' && filasRango === null) {
              return <p className="text-sm text-gray-400 text-center py-6">Elegí el rango de fechas y tocá Aplicar</p>
            }
            if (filas.length === 0) {
              return <p className="text-sm text-gray-400 text-center py-6">Sin ventas Samsung en el período</p>
            }
            return (
              <table className="w-full text-sm min-w-[420px]">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3">SKU</th>
                    <th className="text-right px-4 py-3">Unidades</th>
                    <th className="text-right px-4 py-3">% del período</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filas.map(s => (
                    <tr key={s.sku}>
                      <td className="px-4 py-2.5 font-medium">{s.sku}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#1428a0]">{s.unidades.toLocaleString('es-AR')}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{pct(s.unidades / totalPeriodoSku)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#1428a0]">{totalPeriodoSku.toLocaleString('es-AR')}</td>
                    <td className="px-4 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            )
          })()}
        </div>

        <p className="text-xs text-gray-400 mt-4">
          GOcelular · información confidencial para Samsung Argentina — proyecciones congeladas del run{' '}
          {datos.runMes}, share, tortas y SKUs recalculados en vivo sobre las ventas (marca del producto
          vendido en tienda propia; en terceros, equipo registrado por el comercio al vender).
        </p>
      </div>
    </div>
  )
}
