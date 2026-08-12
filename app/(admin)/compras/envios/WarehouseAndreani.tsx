'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getWarehouseReport, type WarehouseReport } from '@/lib/actions/warehouse-andreani'

type Rango = 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'custom'

const RANGOS: { id: Rango; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'mes', label: 'Mes en curso' },
  { id: 'custom', label: 'Personalizado' },
]

function calcularRango(rango: Rango, desde?: string, hasta?: string): { desde: Date; hasta: Date } | null {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const manana = new Date(hoy)
  manana.setDate(manana.getDate() + 1)

  switch (rango) {
    case 'hoy':
      return { desde: hoy, hasta: manana }
    case 'ayer': {
      const ayer = new Date(hoy)
      ayer.setDate(ayer.getDate() - 1)
      return { desde: ayer, hasta: hoy }
    }
    case '7d': {
      const d = new Date(hoy)
      d.setDate(d.getDate() - 6)
      return { desde: d, hasta: manana }
    }
    case '30d': {
      const d = new Date(hoy)
      d.setDate(d.getDate() - 29)
      return { desde: d, hasta: manana }
    }
    case 'mes': {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      return { desde: d, hasta: manana }
    }
    case 'custom': {
      if (!desde || !hasta) return null
      const d = new Date(desde + 'T00:00:00')
      const h = new Date(hasta + 'T00:00:00')
      h.setDate(h.getDate() + 1)
      return { desde: d, hasta: h }
    }
  }
}

function formatDuracion(min: number | null): string {
  if (min === null) return '—'
  if (min < 60) return `${Math.round(min)}m`
  if (min < 1440) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(min / 1440)
  const h = Math.round((min % 1440) / 60)
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}

const ETAPAS_PIPELINE = [
  { key: 'enCola', label: 'En Cola', sub: 'ingresaron en el período', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { key: 'enviado', label: 'Enviado', sub: 'enviados al WH en el período', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'picking', label: 'Picking', sub: 'pickeados en el período', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'expedido', label: 'Expedido', sub: 'expedidos en el período', color: 'bg-green-50 text-green-700 border-green-200' },
] as const

export default function WarehouseAndreani() {
  const [rango, setRango] = useState<Rango>('30d')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')
  const [report, setReport] = useState<WarehouseReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [granularidad, setGranularidad] = useState<'dia' | 'mes'>('dia')

  const cargar = useCallback(async (r: Rango, desde?: string, hasta?: string) => {
    const fechas = calcularRango(r, desde, hasta)
    if (!fechas) return
    setLoading(true)
    try {
      const data = await getWarehouseReport(fechas.desde.toISOString(), fechas.hasta.toISOString())
      setReport(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (rango !== 'custom') cargar(rango)
  }, [rango, cargar])

  const serie = useMemo(() => {
    if (!report) return []
    if (granularidad === 'dia') {
      return report.expedidosPorDia.map(r => ({
        label: `${r.dia.slice(8, 10)}/${r.dia.slice(5, 7)}`,
        cantidad: r.cantidad,
      }))
    }
    const porMes = new Map<string, number>()
    for (const r of report.expedidosPorDia) {
      const mes = r.dia.slice(0, 7)
      porMes.set(mes, (porMes.get(mes) ?? 0) + r.cantidad)
    }
    return [...porMes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, cantidad]) => ({ label: `${mes.slice(5, 7)}/${mes.slice(0, 4)}`, cantidad }))
  }, [report, granularidad])

  const etapasEntre = report
    ? [report.etapas.colaAEnviado, report.etapas.enviadoAPicking, report.etapas.pickingAExpedido]
    : []

  return (
    <div>
      {/* Filtro de fechas */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {RANGOS.map(r => (
          <button
            key={r.id}
            onClick={() => setRango(r.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              rango === r.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {r.label}
          </button>
        ))}
        {rango === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={customDesde}
              onChange={e => setCustomDesde(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-700"
            />
            <span className="text-xs text-gray-400">—</span>
            <input
              type="date"
              value={customHasta}
              onChange={e => setCustomHasta(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-700"
            />
            <button
              onClick={() => cargar('custom', customDesde, customHasta)}
              disabled={!customDesde || !customHasta}
              className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="text-sm text-gray-400 py-12 text-center">Cargando datos del warehouse...</div>
      )}

      {!loading && report && (
        <>
          {/* Snapshot en tiempo real */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Ahora mismo
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Estado actual del proceso, en tiempo real — no depende del filtro de fechas
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-gray-300 bg-gray-50 rounded-xl p-4">
                <p className="text-3xl font-bold text-gray-800">{report.snapshot.enCola.cantidad}</p>
                <p className="text-xs font-medium text-gray-700 mt-1">En Cola</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Esperando ventana de 15h antes de enviarse a Andreani</p>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Antigüedad prom. {formatDuracion(report.snapshot.enCola.promHoras !== null ? report.snapshot.enCola.promHoras * 60 : null)}
                  {' · '}máx. {formatDuracion(report.snapshot.enCola.maxHoras !== null ? report.snapshot.enCola.maxHoras * 60 : null)}
                </p>
                <p className="text-[11px] mt-1.5 pt-1.5 border-t border-gray-200">
                  <span className="text-green-600 font-semibold">+{report.snapshot.hoyFlujos.ingresados}</span>
                  <span className="text-gray-500"> ingresaron hoy · </span>
                  <span className="text-red-500 font-semibold">−{report.snapshot.hoyFlujos.enviadosWh}</span>
                  <span className="text-gray-500"> pasaron a Andreani</span>
                </p>
                {report.snapshot.enCola.vencidos > 0 && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">
                    ⚠ {report.snapshot.enCola.vencidos} ya pasaron su hora límite de despacho
                  </p>
                )}
              </div>
              <div className="border border-blue-200 bg-blue-50 rounded-xl p-4">
                <p className="text-3xl font-bold text-blue-800">{report.snapshot.pendientesPicking.cantidad}</p>
                <p className="text-xs font-medium text-blue-700 mt-1">Enviados — pendientes de Picking</p>
                <p className="text-[11px] text-blue-600/80 mt-0.5">Ya en poder de Andreani, aún sin pickear</p>
                <p className="text-[11px] text-blue-600/80 mt-1.5">
                  Esperando prom. {formatDuracion(report.snapshot.pendientesPicking.promHoras !== null ? report.snapshot.pendientesPicking.promHoras * 60 : null)}
                  {' · '}máx. {formatDuracion(report.snapshot.pendientesPicking.maxHoras !== null ? report.snapshot.pendientesPicking.maxHoras * 60 : null)}
                </p>
                <p className="text-[11px] mt-1.5 pt-1.5 border-t border-blue-200">
                  <span className="text-green-600 font-semibold">+{report.snapshot.hoyFlujos.enviadosWh}</span>
                  <span className="text-blue-600/80"> recibidos hoy · </span>
                  <span className="text-red-500 font-semibold">−{report.snapshot.picking.hoy}</span>
                  <span className="text-blue-600/80"> pickeados hoy</span>
                </p>
              </div>
              <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
                <p className="text-3xl font-bold text-amber-800">{report.snapshot.picking.hoy}</p>
                <p className="text-xs font-medium text-amber-700 mt-1">Pickeados hoy</p>
                <p className="text-[11px] text-amber-600/80 mt-0.5">Eventos packed de Andreani (llegan con ~1 min de lag)</p>
                <p className="text-[11px] text-amber-600/80 mt-1.5">
                  Última hora: <span className="font-semibold">{report.snapshot.picking.ultimaHora}</span>
                  {report.snapshot.picking.ultimoHaceMin !== null && (
                    <>{' · '}último hace {report.snapshot.picking.ultimoHaceMin < 60
                      ? `${report.snapshot.picking.ultimoHaceMin}m`
                      : formatDuracion(report.snapshot.picking.ultimoHaceMin)}</>
                  )}
                </p>
                <p className="text-[11px] mt-1.5 pt-1.5 border-t border-amber-200">
                  <span className="text-green-600 font-semibold">→{report.snapshot.hoyFlujos.expedidos}</span>
                  <span className="text-amber-600/80"> expedidos hoy</span>
                </p>
                {report.snapshot.picking.atascados > 0 && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">
                    ⚠ {report.snapshot.picking.atascados} pickeado{report.snapshot.picking.atascados !== 1 ? 's' : ''} sin expedir hace +1h
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Pipeline de estados */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Pipeline de pedidos
            </h2>
            <p className="text-xs text-gray-500 mb-5">
              Cuántos pedidos pasaron por cada etapa durante el período. Debajo de cada flecha, el tiempo promedio entre etapas.
            </p>

            <div className="flex flex-col md:flex-row md:items-stretch gap-2">
              {ETAPAS_PIPELINE.map((etapa, i) => (
                <div key={etapa.key} className="flex flex-col md:flex-row md:items-center flex-1 gap-2">
                  <div className={`flex-1 border rounded-xl p-4 text-center ${etapa.color}`}>
                    <p className="text-3xl font-bold">{report.counts[etapa.key]}</p>
                    <p className="text-xs font-medium mt-1">{etapa.label}</p>
                    <p className="text-[10px] opacity-70 mt-0.5">{etapa.sub}</p>
                  </div>
                  {i < ETAPAS_PIPELINE.length - 1 && (
                    <div className="flex md:flex-col items-center justify-center gap-1 md:w-20 shrink-0 py-1">
                      <span className="text-gray-400 rotate-90 md:rotate-0">→</span>
                      <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">
                        {formatDuracion(etapasEntre[i]?.minutos ?? null)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {(report.counts.cancelado > 0 || report.counts.requiereAtencion > 0) && (
              <div className="flex flex-wrap gap-4 mt-4">
                {report.counts.cancelado > 0 && (
                  <p className="text-xs text-gray-400">
                    {report.counts.cancelado} pedido{report.counts.cancelado !== 1 ? 's' : ''} cancelado{report.counts.cancelado !== 1 ? 's' : ''} en el período (no incluidos en el pipeline)
                  </p>
                )}
                {report.counts.requiereAtencion > 0 && (
                  <p className="text-xs text-amber-600 font-medium">
                    ⚠ {report.counts.requiereAtencion} pedido{report.counts.requiereAtencion !== 1 ? 's' : ''} requiere{report.counts.requiereAtencion !== 1 ? 'n' : ''} atención
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Tiempos totales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-500 mb-1">En Cola → Expedido</p>
              <p className="text-3xl font-bold text-gray-900">{formatDuracion(report.etapas.colaAExpedido.minutos)}</p>
              <p className="text-xs text-gray-400 mt-1">
                Promedio sobre {report.etapas.colaAExpedido.muestras} pedido{report.etapas.colaAExpedido.muestras !== 1 ? 's' : ''} expedido{report.etapas.colaAExpedido.muestras !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-500 mb-1">Enviado → Expedido</p>
              <p className="text-3xl font-bold text-gray-900">{formatDuracion(report.etapas.enviadoAExpedido.minutos)}</p>
              <p className="text-xs text-gray-400 mt-1">
                Promedio sobre {report.etapas.enviadoAExpedido.muestras} pedido{report.etapas.enviadoAExpedido.muestras !== 1 ? 's' : ''} expedido{report.etapas.enviadoAExpedido.muestras !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Gráfico de expedidos */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Expedidos por {granularidad === 'dia' ? 'día' : 'mes'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Según fecha de expedición dentro del período</p>
              </div>
              <div className="flex gap-2">
                {(['dia', 'mes'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setGranularidad(g)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      granularidad === g
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {g === 'dia' ? 'Por día' : 'Por mes'}
                  </button>
                ))}
              </div>
            </div>

            {serie.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Sin expediciones en el período seleccionado</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value) => [value ?? 0, 'Expedidos']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="cantidad"
                      stroke="#E91E7B"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#E91E7B' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
