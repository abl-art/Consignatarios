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
import { agruparMarcas, type StockPartnerRow, type VentaMarca } from '@/lib/partner-samsung'
import PieMarcas from './PieMarcas'

// Períodos de la torta del acuerdo (pedido de Emiliano: solo la torta
// derecha filtra; la base jul-sep queda fija). 'custom' va por endpoint
// porque la serie diaria del cliente solo cubre 30 días.
const PERIODOS_TORTA = [
  { key: 'acuerdo', label: 'Desde el 1/10' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'd7', label: '7 días' },
  { key: 'd30', label: '30 días' },
] as const
type PeriodoTorta = (typeof PERIODOS_TORTA)[number]['key'] | 'custom'

function fechaLocal(diasAtras: number): string {
  const d = new Date()
  d.setDate(d.getDate() - diasAtras)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD local
}

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

export default function SamsungClient({
  datos: todos,
  stockSamsung,
}: {
  datos: Record<CanalPartner, DatosPartnerSamsung | null>
  stockSamsung: StockPartnerRow[]
}) {
  // El acuerdo aplica a la venta propia: es el canal por defecto
  const [canal, setCanalInterno] = useState<Canal>('propia')
  const [periodoSku, setPeriodoSku] = useState<PeriodoSku>('hoy')
  const [periodoTorta, setPeriodoTorta] = useState<PeriodoTorta>('acuerdo')
  const [rangoFechas, setRangoFechas] = useState({ desde: '', hasta: '' })
  const [filasRango, setFilasRango] = useState<{ sku: string; unidades: number }[] | null>(null)
  const [cargandoRango, setCargandoRango] = useState(false)
  const [rangoTorta, setRangoTorta] = useState({ desde: '', hasta: '' })
  const [tortaRango, setTortaRango] = useState<VentaMarca[] | null>(null)
  const [cargandoTorta, setCargandoTorta] = useState(false)
  const datos = todos[canal]

  // El rango aplicado es por canal: al cambiarlo se vuelve a pedir
  function setCanal(c: Canal) {
    setCanalInterno(c)
    setTortaRango(null)
  }
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

  async function aplicarRangoTorta() {
    if (!rangoTorta.desde || !rangoTorta.hasta) return
    setCargandoTorta(true)
    try {
      const token = new URLSearchParams(window.location.search).get('token') ?? ''
      const res = await fetch(
        `/partner/samsung/marcas?token=${encodeURIComponent(token)}&desde=${rangoTorta.desde}&hasta=${rangoTorta.hasta}&canal=${canal}`
      )
      const json = await res.json()
      setTortaRango(Array.isArray(json.marcas) ? json.marcas : [])
    } catch {
      setTortaRango([])
    } finally {
      setCargandoTorta(false)
    }
  }
  if (!datos) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Sin datos para este canal.
      </div>
    )
  }
  const { escenarios, historico, shareFijo, shareActual, muestraActual, marcasFijo, marcasActual, marcasDiarias } = datos

  // Torta derecha según la píldora elegida: 'acuerdo' usa el acumulado del
  // server; el resto se agrupa de la serie diaria (fechas locales AR)
  const tortaActual =
    periodoTorta === 'acuerdo'
      ? marcasActual
      : periodoTorta === 'custom'
        ? (tortaRango ?? [])
        : agruparMarcas(
            marcasDiarias.filter(d =>
              periodoTorta === 'ayer' ? d.fecha === fechaLocal(1) : d.fecha >= fechaLocal(periodoTorta === 'd7' ? 7 : 30)
            )
          )
  const subtituloTorta =
    periodoTorta === 'acuerdo'
      ? 'acumulado del acuerdo, en vivo'
      : periodoTorta === 'ayer'
        ? 'ventas de ayer'
        : periodoTorta === 'd7'
          ? 'últimos 7 días'
          : periodoTorta === 'd30'
            ? 'últimos 30 días'
            : tortaRango !== null && rangoTorta.desde && rangoTorta.hasta
              ? `del ${rangoTorta.desde} al ${rangoTorta.hasta}`
              : 'elegí el rango y tocá Aplicar'

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
            <div>
              <div className="flex flex-wrap justify-center gap-1 mb-2">
                {PERIODOS_TORTA.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPeriodoTorta(p.key)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                      periodoTorta === p.key ? 'bg-[#1428a0] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setPeriodoTorta('custom')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                    periodoTorta === 'custom' ? 'bg-[#1428a0] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Personalizado
                </button>
              </div>
              {periodoTorta === 'custom' && (
                <div className="flex flex-wrap items-center justify-center gap-1 mb-2">
                  <input type="date" value={rangoTorta.desde} max={rangoTorta.hasta || undefined}
                    onChange={e => setRangoTorta(r => ({ ...r, desde: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-1.5 py-0.5 text-[11px] text-gray-700" />
                  <span className="text-[11px] text-gray-400">→</span>
                  <input type="date" value={rangoTorta.hasta} min={rangoTorta.desde || undefined}
                    onChange={e => setRangoTorta(r => ({ ...r, hasta: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-1.5 py-0.5 text-[11px] text-gray-700" />
                  <button onClick={aplicarRangoTorta} disabled={!rangoTorta.desde || !rangoTorta.hasta || cargandoTorta}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[#1428a0] text-white disabled:opacity-40">
                    {cargandoTorta ? '...' : 'Aplicar'}
                  </button>
                </div>
              )}
              <PieMarcas
                titulo={PERIODOS_TORTA.find(p => p.key === periodoTorta)?.label ?? 'Personalizado'}
                subtitulo={subtituloTorta}
                data={tortaActual}
              />
            </div>
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

        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mt-6">
          <div className="px-4 pt-4">
            <h2 className="font-semibold text-gray-900 text-sm">Stock Samsung disponible</h2>
            <p className="text-xs text-gray-400 mb-3">
              Disponible = stock en depósitos menos unidades pendientes de asignar · actualizado en cada visita.
            </p>
          </div>
          {stockSamsung.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Stock no disponible en este momento</p>
          ) : (
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3">Modelo</th>
                  <th className="text-right px-4 py-3" title="Stock en depósitos menos pendientes de asignar">Disponible</th>
                  <th className="text-right px-4 py-3" title="Unidades compradas en camino al depósito">En tránsito</th>
                  <th className="text-right px-4 py-3" title="Unidades pedidas al proveedor, aún no despachadas">Pedido</th>
                  <th className="text-right px-4 py-3" title="Disponible + en tránsito + pedido">Próxima disponib.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stockSamsung.map(r => (
                  <tr key={`${r.sku}-${r.nombre}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-900">{r.nombre}</span>
                      <span className="ml-2 font-mono text-[11px] text-gray-400">{r.sku}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#1428a0]">
                      {r.disponible.toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {r.enTransito ? r.enTransito.toLocaleString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {r.pedido ? r.pedido.toLocaleString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                      {r.proximaDisponibilidad.toLocaleString('es-AR')}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td className="px-4 py-2.5 font-semibold">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#1428a0]">
                    {stockSamsung.reduce((s, r) => s + r.disponible, 0).toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-600">
                    {stockSamsung.reduce((s, r) => s + r.enTransito, 0).toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-600">
                    {stockSamsung.reduce((s, r) => s + r.pedido, 0).toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900">
                    {stockSamsung.reduce((s, r) => s + r.proximaDisponibilidad, 0).toLocaleString('es-AR')}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
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
