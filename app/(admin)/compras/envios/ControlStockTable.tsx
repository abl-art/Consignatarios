'use client'

import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { netoPorModelo, type ModeloNeto } from '@/lib/control-stock'
import type { CorteControlStock } from '@/lib/actions/control-stock'

// Solapa Control Stock: SOLO cortes guardados (4 por día, a los ~:50 de cada
// corrida del job de Pedro — Andreani no es tiempo real, comparar en vivo
// mezcla momentos). Semántica verificada: And. disponible = stock físico −
// pedidos enviados sin pickear; GO comparable = available en andreani_wh −
// enviados sin pickear. En un corte sano la diferencia debería ser 0.

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

function DifBadge({ dif }: { dif: number }) {
  if (dif === 0) return <span className="text-green-600 font-medium">✓ 0</span>
  return (
    <span className={`font-bold ${Math.abs(dif) >= 5 ? 'text-red-600' : 'text-amber-600'}`}>
      {dif > 0 ? '+' : ''}{dif}
    </span>
  )
}

function Tarjeta({ titulo, abiertaInicial, resumen, children }: {
  titulo: string
  abiertaInicial: boolean
  resumen?: string
  children: React.ReactNode
}) {
  const [abierta, setAbierta] = useState(abiertaInicial)
  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <button
        onClick={() => setAbierta(a => !a)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{titulo}</h2>
          {resumen && <p className="text-xs text-gray-500 mt-0.5">{resumen}</p>}
        </div>
        <span className={`text-gray-400 transition-transform ${abierta ? 'rotate-90' : ''}`}>›</span>
      </button>
      {abierta && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

function TablaModelos({ modelos }: { modelos: ModeloNeto[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <th className="py-2 px-3 font-medium">Modelo</th>
            <th className="py-2 px-3 font-medium text-right">SKUs</th>
            <th className="py-2 px-3 font-medium text-right">Andreani disp.</th>
            <th className="py-2 px-3 font-medium text-right">GO comparable</th>
            <th className="py-2 px-3 font-medium text-right">Diferencia</th>
            <th className="py-2 px-3 font-medium text-right">En cola (solo GO)</th>
            <th className="py-2 px-3 font-medium text-right text-magenta-700">Disponible real</th>
          </tr>
        </thead>
        <tbody>
          {modelos.map(m => (
            <tr key={m.nombre} className={`border-b border-gray-100 ${m.dif !== 0 ? 'bg-amber-50/40' : ''}`}>
              <td className="py-1.5 px-3 text-gray-900">{m.nombre}</td>
              <td className="py-1.5 px-3 text-right text-gray-500">{m.skus}</td>
              <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{m.andDisponible}</td>
              <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{m.goComparable}</td>
              <td className="py-1.5 px-3 text-right tabular-nums"><DifBadge dif={m.dif} /></td>
              <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{m.enCola > 0 ? `−${m.enCola}` : '—'}</td>
              <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-magenta-700">{m.disponibleReal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilaCorteExpandible({ corte, abiertaInicial }: { corte: CorteControlStock; abiertaInicial: boolean }) {
  const [abierta, setAbierta] = useState(abiertaInicial)
  const modelos = useMemo(() => netoPorModelo(corte.filas, corte.enCola), [corte])
  const conDif = modelos.filter(m => m.dif !== 0)
  const unidades = conDif.reduce((s, m) => s + Math.abs(m.dif), 0)
  return (
    <div className="border border-gray-100 rounded-lg">
      <button
        onClick={() => setAbierta(a => !a)}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 rounded-lg"
      >
        <span className="text-sm font-medium text-gray-900">{fechaHora(corte.runAt)}</span>
        <span className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">{corte.filas.filter(f => f.medido).length} SKUs</span>
          <span className={conDif.length > 0 ? 'text-amber-600 font-semibold' : 'text-green-700 font-medium'}>
            {conDif.length > 0 ? `${conDif.length} modelos con dif (${unidades} u.)` : '✓ sin diferencias'}
          </span>
          <span className={`text-gray-400 transition-transform ${abierta ? 'rotate-90' : ''}`}>›</span>
        </span>
      </button>
      {abierta && (
        <div className="px-3 pb-3">
          <TablaModelos modelos={modelos} />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Andreani leído a las {fechaHora(corte.runAt)} · lado GOcelular medido a las {fechaHora(corte.corteAt)}
          </p>
        </div>
      )}
    </div>
  )
}

export default function ControlStockTable({ cortes }: { cortes: CorteControlStock[] }) {
  // Serie del gráfico y píldoras (hooks antes de cualquier return condicional)
  const serieBase = useMemo(() => {
    const asc = [...cortes].sort((a, b) => a.runAt.localeCompare(b.runAt))
    return asc.map(c => {
      const modelos = netoPorModelo(c.filas, c.enCola)
      const dif: Record<string, number> = {}
      for (const m of modelos) dif[m.nombre] = m.dif
      const total = modelos.reduce((s, m) => s + Math.abs(m.dif), 0)
      return { label: fechaHora(c.runAt), dif, total }
    })
  }, [cortes])
  const modelosDelGrafico = useMemo(() => {
    const maxAbs = new Map<string, number>()
    for (const p of serieBase) {
      for (const [nombre, d] of Object.entries(p.dif)) {
        maxAbs.set(nombre, Math.max(maxAbs.get(nombre) ?? 0, Math.abs(d)))
      }
    }
    return [...maxAbs.entries()].sort((a, b) => b[1] - a[1]).map(([nombre]) => nombre)
  }, [serieBase])
  const [modeloSel, setModeloSel] = useState<string | null>(null)

  if (cortes.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-500">Todavía no hay cortes guardados.</p>
        <p className="text-xs text-gray-400 mt-2">
          Los cortes se toman solos a los ~:50 de cada corrida del job de Andreani (03:50, 09:50 y 15:50 ART; la
          corrida de las 21:44 ART falla siempre por mantenimiento de Andreani). El primero aparece en la próxima
          corrida.
        </p>
      </div>
    )
  }

  const ultimo = cortes[0]
  const modelosUltimo = netoPorModelo(ultimo.filas, ultimo.enCola)
  const conDifUltimo = modelosUltimo.filter(m => m.dif !== 0)
  const unidadesNetas = conDifUltimo.reduce((s, m) => s + Math.abs(m.dif), 0)
  const enColaTotal = ultimo.enCola.reduce((s, e) => s + e.unidades, 0)

  const sel = modeloSel ?? modelosDelGrafico[0] ?? null
  const dataChart = serieBase.map(p => ({
    label: p.label,
    valor: sel === null ? p.total : (p.dif[sel] ?? 0),
  }))

  return (
    <div className="space-y-4">
      {/* Resumen del último corte */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Último corte</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fechaHora(ultimo.runAt)}</p>
          <p className="text-xs text-gray-400 mt-1">3 cortes por día (la corrida de las 21:44 ART falla siempre)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Modelos con diferencia</p>
          <p className={`text-2xl font-bold mt-1 ${conDifUltimo.length > 0 ? 'text-amber-600' : 'text-green-700'}`}>{conDifUltimo.length}</p>
          <p className="text-xs text-gray-400 mt-1">de {modelosUltimo.length} modelos medidos</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Unidades de diferencia</p>
          <p className={`text-2xl font-bold mt-1 ${unidadesNetas > 0 ? 'text-red-600' : 'text-green-700'}`}>{unidadesNetas}</p>
          <p className="text-xs text-gray-400 mt-1">neta por modelo — debería ser 0</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Vendido en cola</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{enColaTotal}</p>
          <p className="text-xs text-gray-400 mt-1">solo GO lo conoce · resta del disponible real</p>
        </div>
      </div>

      {/* Cortes */}
      <Tarjeta
        titulo="Cortes"
        abiertaInicial
        resumen="Un corte por corrida del job (Andreani y GOcelular medidos en el mismo momento) — expandí cada uno para ver el neto por modelo"
      >
        <div className="space-y-2">
          {cortes.map((c, i) => (
            <FilaCorteExpandible key={c.id} corte={c} abiertaInicial={i === 0} />
          ))}
        </div>
      </Tarjeta>

      {/* Gráfico de persistencia */}
      <Tarjeta
        titulo="Diferencias por corte"
        abiertaInicial
        resumen="Persistencia de errores: una diferencia que sobrevive corte tras corte es real (faltante o registro); un pico aislado fue timing"
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setModeloSel(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${sel === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
          >
            Total (u. netas)
          </button>
          {modelosDelGrafico.map(m => (
            <button
              key={m}
              onClick={() => setModeloSel(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${sel === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dataChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip
                formatter={v => [v ?? 0, sel === null ? 'Unidades netas' : 'Diferencia']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Line type="monotone" dataKey="valor" stroke="#E91E7B" strokeWidth={2} dot={{ r: 3, fill: '#E91E7B' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Tarjeta>

      {/* Por SKU del último corte */}
      <Tarjeta
        titulo={`Por SKU — corte ${fechaHora(ultimo.runAt)}`}
        abiertaInicial={false}
        resumen="Detalle por color-SKU: una diferencia por color con neto 0 en el modelo es stock cruzado de color, no faltante"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <th className="py-2 px-3 font-medium">SKU</th>
                <th className="py-2 px-3 font-medium">Modelo</th>
                <th className="py-2 px-3 font-medium text-right">And. total</th>
                <th className="py-2 px-3 font-medium text-right">And. disponible</th>
                <th className="py-2 px-3 font-medium text-right">GO WH Andreani</th>
                <th className="py-2 px-3 font-medium text-right">Env. s/pickear</th>
                <th className="py-2 px-3 font-medium text-right">GO comparable</th>
                <th className="py-2 px-3 font-medium text-right">GO local</th>
                <th className="py-2 px-3 font-medium text-right">GO tránsito</th>
                <th className="py-2 px-3 font-medium text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {ultimo.filas.map(f => (
                <tr key={f.sku} className={`border-b border-gray-100 ${f.medido && f.dif !== 0 ? 'bg-amber-50/40' : ''}`}>
                  <td className="py-1.5 px-3 font-mono text-xs text-gray-600">{f.sku}</td>
                  <td className="py-1.5 px-3 text-gray-900">
                    {f.nombre ?? f.sku}
                    {!f.medido && !f.error && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">sin medir</span>
                    )}
                    {f.error && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-medium" title={f.error}>error</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{f.medido ? f.and_total : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{f.medido ? f.and_disponible : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{f.go_andreani}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{f.go_enviados > 0 ? `−${f.go_enviados}` : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-medium text-gray-800">{f.go_andreani - f.go_enviados}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-400">{f.go_local > 0 ? f.go_local : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-400">{f.go_transito > 0 ? f.go_transito : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{f.medido ? <DifBadge dif={f.dif} /> : <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          And. disponible = stock físico de Andreani − pedidos que le enviamos sin pickear (semántica verificada) ·
          GO comparable = available en su WH al momento del corte − esos mismos pedidos · el depósito propio y lo en
          tránsito no entran en la diferencia
        </p>
      </Tarjeta>
    </div>
  )
}
