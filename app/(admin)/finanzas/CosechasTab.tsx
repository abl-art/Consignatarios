'use client'

// Pestaña "Cosechas": lista de cohortes custom (congeladas en Supabase) con
// selección múltiple para comparar — madurez, vintage, Payment Default y
// curva de evolución a igual edad, una tarjeta por vista con una fila/serie
// por cosecha seleccionada. El form de creación (CosechaForm) vive colapsado
// arriba y solo aparece si el usuario puede operar.

import { Fragment, useEffect, useRef, useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatearMoneda } from '@/lib/utils'
import type { Cosecha } from '@/lib/cosechas'
import { borrarCosecha, fetchMetricasCosechas, type MetricasCosecha } from '@/lib/actions/cosechas'
import type { MerchantTercero } from '@/lib/actions/finanzas'
import CosechaForm from './CosechaForm'
import { SEGMENTS } from './VintageTab'

interface Props {
  cosechas: Cosecha[]
  merchants: MerchantTercero[]
  operar: boolean
}

const PALETA_CURVA = ['#2563eb', '#e11d48', '#f59e0b', '#10b981', '#8b5cf6', '#0d9488']

const LABELS_TRUSTONIC: Record<string, string> = {
  active: 'Activo',
  locked: 'Bloqueado',
  ready_for_use: 'Listo para uso',
  idle: 'Inactivo',
  released: 'Liberado',
  returned: 'Devuelto',
}

const LABELS_BLOQUEO: Record<string, string> = { knox: 'Knox', motosafe: 'Motosafe', dlc: 'DLC' }
const LABELS_CANAL: Record<string, string> = { total: 'Total', propia: 'Venta Propia', terceros: 'Venta de Terceros' }

function formatFecha(fecha: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR')
}

function formatPd(value: number): string {
  return `${value.toFixed(1)}%`
}

function pdColor(value: number): string {
  if (value <= 25) return 'text-green-600'
  if (value <= 50) return 'text-yellow-600'
  return 'text-red-600'
}

// Chips resumen de los filtros de una cosecha, para la fila de la lista.
function chipsFiltros(c: Cosecha, merchants: MerchantTercero[]): string[] {
  const f = c.filtros
  const chips: string[] = [LABELS_CANAL[f.canal] ?? f.canal]

  if (f.merchantId) {
    const merchant = merchants.find(m => m.clientId === f.merchantId)
    const store = merchant?.stores.find(s => s.id === f.storeId)
    chips.push(store ? `${merchant?.nombre ?? f.merchantId} · ${store.nombre}` : merchant?.nombre ?? f.merchantId)
  }

  if (f.segmentoLetra || f.segmentoNumero) {
    chips.push(`Seg ${f.segmentoLetra ?? ''}${f.segmentoLetra && f.segmentoNumero ? '·' : ''}${f.segmentoNumero ?? ''}`)
  }

  if (f.bloqueo) chips.push(LABELS_BLOQUEO[f.bloqueo] ?? f.bloqueo)

  if (f.trustonic && f.trustonic.length > 0) {
    chips.push(f.trustonic.map(e => LABELS_TRUSTONIC[e] ?? e).join('/'))
  }

  if (f.modelos && f.modelos.length > 0) {
    chips.push(`${f.modelos.length} modelo${f.modelos.length > 1 ? 's' : ''}`)
  }

  if (c.limite !== null) chips.push(`Límite ${c.limite}`)

  return chips
}

export default function CosechasTab({ cosechas, merchants, operar }: Props) {
  const [lista, setLista] = useState<Cosecha[]>(cosechas)
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(
    () => new Set(cosechas.slice(0, 2).map(c => c.id)),
  )
  const [showForm, setShowForm] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)

  const [metricas, setMetricas] = useState<MetricasCosecha[]>([])
  const [cargandoMetricas, setCargandoMetricas] = useState(false)
  const [errorMetricas, setErrorMetricas] = useState<string | null>(null)
  const cacheMetricas = useRef(new Map<string, MetricasCosecha>())

  const seleccionKey = Array.from(seleccionadas).sort().join(',')

  useEffect(() => {
    const ids = Array.from(seleccionadas)
    if (ids.length === 0) {
      setMetricas([])
      setErrorMetricas(null)
      return
    }
    const cache = cacheMetricas.current
    const faltantes = ids.filter(id => !cache.has(id))
    if (faltantes.length === 0) {
      setMetricas(ids.map(id => cache.get(id)!))
      setErrorMetricas(null)
      return
    }
    let vivo = true
    setCargandoMetricas(true)
    setErrorMetricas(null)
    fetchMetricasCosechas(faltantes)
      .then(nuevas => {
        if (!vivo) return
        for (const m of nuevas) cache.set(m.id, m)
        setMetricas(ids.map(id => cache.get(id)).filter((m): m is MetricasCosecha => !!m))
      })
      .catch(() => {
        if (vivo) setErrorMetricas('No se pudieron cargar las métricas de las cosechas seleccionadas')
      })
      .finally(() => {
        if (vivo) setCargandoMetricas(false)
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionKey])

  function toggleSeleccion(id: string) {
    setSeleccionadas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreada(c: Cosecha) {
    setLista(prev => [c, ...prev])
    setShowForm(false)
  }

  async function handleBorrar(id: string, nombre: string) {
    if (!confirm(`¿Borrar la cosecha "${nombre}"? Esta acción no se puede deshacer.`)) return
    setBorrando(id)
    try {
      const res = await borrarCosecha(id)
      if (res.ok) {
        setLista(prev => prev.filter(c => c.id !== id))
        setSeleccionadas(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        cacheMetricas.current.delete(id)
      }
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div className="space-y-6">
      {operar && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowForm(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <h3 className="font-semibold text-gray-900">Nueva cosecha</h3>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${showForm ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showForm && (
            <div className="border-t border-gray-200 p-5">
              <CosechaForm merchants={merchants} onCreada={handleCreada} />
            </div>
          )}
        </div>
      )}

      {lista.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          {operar
            ? 'Todavía no hay cosechas. Creá la primera arriba para empezar a comparar cohortes.'
            : 'Todavía no hay cosechas creadas.'}
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {lista.map(c => {
              const metrica = metricas.find(m => m.id === c.id)
              const anuladas = metrica ? metrica.cantOrdenes - metrica.ordenesActivas : 0
              return (
                <div key={c.id} className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={seleccionadas.has(c.id)}
                    onChange={() => toggleSeleccion(c.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{c.nombre}</span>
                      <span className="text-xs text-gray-400">{formatFecha(c.fechaDesde)} a {formatFecha(c.fechaHasta)}</span>
                      {anuladas > 0 && (
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-700">
                          {anuladas} anulada{anuladas > 1 ? 's' : ''} desde la creación
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                      <span>{c.cantOrdenes} de {c.cantDisponibles} disponibles</span>
                      <span>Monto financiado {formatearMoneda(c.montoTotal)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {chipsFiltros(c, merchants).map((chip, i) => (
                        <span key={i} className="px-2 py-0.5 text-[11px] rounded-full bg-gray-100 text-gray-600">{chip}</span>
                      ))}
                    </div>
                  </div>
                  {operar && (
                    <button
                      onClick={() => handleBorrar(c.id, c.nombre)}
                      disabled={borrando === c.id}
                      className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {borrando === c.id ? 'Borrando…' : 'Borrar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {errorMetricas && <p className="text-xs text-red-600">{errorMetricas}</p>}
          {cargandoMetricas && <p className="text-xs text-gray-400 animate-pulse">Actualizando métricas…</p>}

          {metricas.length === 0 ? (
            !cargandoMetricas && (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
                Elegí al menos una cosecha para ver sus métricas.
              </div>
            )
          ) : (
            <>
              <MadurezCompare metricas={metricas} />
              <VintageCompare metricas={metricas} />
              <PDCompare metricas={metricas} />
              <CurvaCompare metricas={metricas} />
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Madurez
// ---------------------------------------------------------------------------

function MadurezCompare({ metricas }: { metricas: MetricasCosecha[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-700 mb-3">Madurez</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricas.map(m => (
          <div key={m.id} className="border border-gray-200 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-800 mb-2 truncate" title={m.nombre}>{m.nombre}</p>
            <dl className="text-xs text-gray-600 space-y-1.5">
              <div className="flex justify-between">
                <dt>Edad (orden más joven)</dt>
                <dd className="font-medium text-gray-800">{m.madurez.edadDias} días</dd>
              </div>
              <div className="flex justify-between">
                <dt>% por vencer</dt>
                <dd className="font-medium text-blue-600">{m.madurez.pctPorVencer.toFixed(2)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt>Fin de ciclo</dt>
                <dd className="font-medium text-gray-800">{formatFecha(m.madurez.finCiclo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Días restantes</dt>
                <dd className="font-medium text-gray-800">{m.madurez.diasRestantes}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Órdenes</dt>
                <dd className="font-medium text-gray-800">{m.ordenesActivas} de {m.cantOrdenes}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vintage comparado
// ---------------------------------------------------------------------------

function VintageCompare({ metricas }: { metricas: MetricasCosecha[] }) {
  const chartData = metricas.map(m => ({
    nombre: m.nombre,
    pct_cobrada_en_termino: m.vintage.pct_cobrada_en_termino,
    pct_por_vencer: m.vintage.pct_por_vencer,
    pct_mora_1_29: m.vintage.pct_mora_1_29,
    pct_mora_30_59: m.vintage.pct_mora_30_59,
    pct_mora_60_89: m.vintage.pct_mora_60_89,
    pct_incobrable_90_plus: m.vintage.pct_incobrable_90_plus,
    pct_recupero_1_29: m.vintage.pct_recupero_1_29,
    pct_recupero_30_59: m.vintage.pct_recupero_30_59,
    pct_recupero_60_89: m.vintage.pct_recupero_60_89,
    pct_recupero_90_119: m.vintage.pct_recupero_90_119,
    pct_recupero_120_plus: m.vintage.pct_recupero_120_plus,
  }))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-700 mb-3">Vintage comparado</p>
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-2 py-2 font-semibold text-gray-600 border-b border-gray-200">Cosecha</th>
              <th className="text-right px-2 py-2 font-semibold text-gray-600 border-b border-gray-200 border-l border-gray-300">Monto financiado</th>
              <th className="text-right px-2 py-2 font-semibold text-green-700 border-b border-gray-200 border-l border-gray-300">En term.</th>
              <th className="text-right px-2 py-2 font-semibold text-blue-700 border-b border-gray-200 border-l border-gray-300">Por vencer</th>
              <th colSpan={3} className="text-center px-2 py-2 font-semibold text-orange-700 border-b border-gray-200 border-l border-gray-300">Mora (1-29/30-59/60-89)</th>
              <th className="text-right px-2 py-2 font-semibold text-red-900 border-b border-gray-200 border-l border-gray-300">Incobr.</th>
              <th colSpan={5} className="text-center px-2 py-2 font-semibold text-emerald-700 border-b border-gray-200 border-l border-gray-300">Recupero (1-29/30-59/60-89/90-119/120+)</th>
            </tr>
          </thead>
          <tbody>
            {metricas.map(m => (
              <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1.5 text-gray-700 font-medium truncate max-w-[160px]" title={m.nombre}>{m.nombre}</td>
                <td className="px-2 py-1.5 text-right text-gray-700 border-l border-gray-300">{formatearMoneda(m.vintage.amt_total)}</td>
                <td className="px-2 py-1.5 text-right font-medium text-green-600 border-l border-gray-300">{m.vintage.pct_cobrada_en_termino.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-blue-600 border-l border-gray-300">{m.vintage.pct_por_vencer.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-yellow-600 border-l border-gray-300">{m.vintage.pct_mora_1_29.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-amber-600">{m.vintage.pct_mora_30_59.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-orange-600">{m.vintage.pct_mora_60_89.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-bold text-red-900 border-l border-gray-300">{m.vintage.pct_incobrable_90_plus.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-emerald-300 border-l border-gray-300">{m.vintage.pct_recupero_1_29.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-emerald-400">{m.vintage.pct_recupero_30_59.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-emerald-600">{m.vintage.pct_recupero_60_89.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-emerald-700">{m.vintage.pct_recupero_90_119.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-medium text-emerald-800">{m.vintage.pct_recupero_120_plus.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="w-full h-72 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="nombre" stroke="#6b7280" fontSize={10} />
            <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              formatter={(value, name) => {
                const seg = SEGMENTS.find(s => s.key === String(name))
                return [`${Number(value).toFixed(2)}%`, seg?.label ?? String(name)]
              }}
              labelStyle={{ color: '#374151' }}
              contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
            />
            <Legend
              formatter={(value: string) => {
                const seg = SEGMENTS.find(s => s.key === value)
                return seg?.label ?? value
              }}
              wrapperStyle={{ fontSize: 10 }}
            />
            {SEGMENTS.map(seg => (
              <Bar key={seg.key} dataKey={seg.key} stackId="vintage" fill={seg.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Payment Default comparado
// ---------------------------------------------------------------------------

function PDCompare({ metricas }: { metricas: MetricasCosecha[] }) {
  const maxCuota = Math.max(0, ...metricas.map(m => m.maxCuota))
  const cuotas = Array.from({ length: maxCuota }, (_, i) => i + 1)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-700 mb-3">Payment Default comparado</p>
      {cuotas.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">Sin datos</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-gray-500 font-medium">Cosecha</th>
                <th className="px-2 py-1 text-left text-gray-500 font-medium">Métrica</th>
                {cuotas.map(c => (
                  <th key={c} className="px-2 py-1 text-center text-gray-600 font-bold">C{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricas.map(m => (
                <Fragment key={m.id}>
                  <tr className="border-t border-gray-200">
                    <td className="px-2 py-1.5 font-medium text-gray-800 truncate max-w-[140px]" rowSpan={2} title={m.nombre}>{m.nombre}</td>
                    <td className="px-2 py-1.5 font-semibold text-red-600 whitespace-nowrap">PD Hard</td>
                    {cuotas.map(c => {
                      const r = m.pdResumen.find(x => x.cuota === c)
                      if (!r) return <td key={c} className="px-2 py-1.5 text-center text-gray-300">—</td>
                      return <td key={c} className={`px-2 py-1.5 text-center font-bold ${pdColor(r.pd_hard)}`}>{formatPd(r.pd_hard)}</td>
                    })}
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 font-semibold text-orange-600 whitespace-nowrap">PD 30</td>
                    {cuotas.map(c => {
                      const r = m.pdResumen.find(x => x.cuota === c)
                      if (!r) return <td key={c} className="px-2 py-1.5 text-center text-gray-300">—</td>
                      return <td key={c} className={`px-2 py-1.5 text-center font-bold ${pdColor(r.pd_30)}`}>{formatPd(r.pd_30)}</td>
                    })}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Curva de evolución comparada
// ---------------------------------------------------------------------------

function CurvaCompare({ metricas }: { metricas: MetricasCosecha[] }) {
  const edadesSet = new Set<number>()
  for (const m of metricas) for (const p of m.curva) edadesSet.add(p.edadDias)
  const edades = Array.from(edadesSet).sort((a, b) => a - b)

  const porCosecha = metricas.map((m, i) => {
    const solida = m.curva.filter(p => p.cobertura === 1)
    const ultimaSolida = solida[solida.length - 1]
    const punteada = m.curva.filter(p => p.cobertura < 1)
    const punteadaConPuente = ultimaSolida ? [ultimaSolida, ...punteada] : punteada

    const porEdad = new Map<number, { solida?: number; punteada?: number; cobertura?: number }>()
    for (const p of solida) porEdad.set(p.edadDias, { solida: p.pctImpago, cobertura: p.cobertura })
    for (const p of punteadaConPuente) {
      const existente = porEdad.get(p.edadDias) ?? {}
      existente.punteada = p.pctImpago
      existente.cobertura = p.cobertura
      porEdad.set(p.edadDias, existente)
    }

    return { metrica: m, color: PALETA_CURVA[i % PALETA_CURVA.length], porEdad }
  })

  const data = edades.map(edadDias => {
    const fila: Record<string, number | undefined> = { edadDias }
    porCosecha.forEach(({ porEdad }, i) => {
      const punto = porEdad.get(edadDias)
      fila[`c${i}_solida`] = punto?.solida
      fila[`c${i}_punteada`] = punto?.punteada
      fila[`c${i}_cobertura`] = punto?.cobertura
    })
    return fila
  })

  const sinDatos = metricas.every(m => m.curva.length === 0)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-700 mb-3">Curva de evolución (% impago por edad de cohorte)</p>
      {sinDatos ? (
        <p className="text-xs text-gray-400 text-center py-8">Todavía no hay suficiente cobertura para graficar la curva</p>
      ) : (
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 15, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="edadDias"
                type="number"
                domain={['dataMin', 'dataMax']}
                stroke="#6b7280"
                fontSize={11}
                label={{ value: 'Edad (días)', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#6b7280' }}
              />
              <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                formatter={(value, name, entry) => {
                  if (typeof value !== 'number') return ['', String(name)]
                  const dataKey = String(entry?.dataKey ?? '')
                  const idx = dataKey.match(/^c(\d+)_/)?.[1]
                  const fila = (entry?.payload ?? {}) as Record<string, number | undefined>
                  const cobertura = idx !== undefined ? fila[`c${idx}_cobertura`] : undefined
                  const coberturaTxt = cobertura !== undefined ? ` (cobertura ${Math.round(cobertura * 100)}%)` : ''
                  return [`${value.toFixed(2)}%${coberturaTxt}`, String(name)]
                }}
                labelFormatter={(label) => `Edad: ${label} días`}
                labelStyle={{ color: '#374151' }}
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {porCosecha.map(({ metrica, color }, i) => (
                <Fragment key={metrica.id}>
                  <Line
                    type="monotone"
                    dataKey={`c${i}_solida`}
                    name={metrica.nombre}
                    stroke={color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: color }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={`c${i}_punteada`}
                    name={metrica.nombre}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3, fill: color }}
                    legendType="none"
                    connectNulls={false}
                  />
                </Fragment>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
