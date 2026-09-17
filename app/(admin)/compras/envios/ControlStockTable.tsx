'use client'

import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { clasificarCortes, descomponerModelos, netoPorModelo, type DifClasificada, type ModeloDescompuesto } from '@/lib/control-stock'
import type { CorteControlStock } from '@/lib/actions/control-stock'

// Solapa Control Stock: SOLO cortes guardados (4 por día, a los ~:50 de cada
// corrida del job de Pedro — Andreani no es tiempo real, comparar en vivo
// mezcla momentos). Semántica verificada contra el portal (17/9): And.
// disponible = stock físico − pickeado; GO comparable = available en
// andreani_wh (sin restar la cola, Andreani tampoco la resta).
// Cada diferencia por modelo se DESCOMPONE en causas conocidas: fantasmas
// (despachos sin IMEI de la lista de Pedro) + putaway (recepción que Andreani
// no ingresó a su total) + residual. El residual es lo real: se clasifica por
// persistencia entre cortes (uno que desaparece solo era lag de novedad).

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

function EstadoChip({ dif, fechaDesde }: { dif: DifClasificada; fechaDesde: string }) {
  const chip = {
    real: { texto: `Real — el residual persiste desde ${fechaDesde} (${dif.cortes} cortes)`, clase: 'bg-red-50 text-red-700' },
    nueva: { texto: 'Nuevo — a confirmar en el próximo corte', clase: 'bg-amber-50 text-amber-700' },
    resuelta: { texto: 'Se resolvió solo — era lag', clase: 'bg-green-50 text-green-700' },
    persistia: { texto: 'Persistía en el corte siguiente', clase: 'bg-amber-50 text-amber-700' },
  }[dif.estado]
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${chip.clase}`}>{chip.texto}</span>
  )
}

// Muestra dif = fantasma + putaway + residual como chips chicos (de dónde sale el número)
function Desglose({ dif }: { dif: DifClasificada }) {
  const partes = [
    dif.fantasmas > 0 && `${dif.fantasmas} fantasma s/IMEI`,
    dif.putaway > 0 && `${dif.putaway} putaway`,
  ].filter(Boolean)
  if (partes.length === 0) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {dif.fantasmas > 0 && (
        <span className="inline-flex px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-medium" title="Despachos sin IMEI conocidos (lista de Pedro)">
          🫥 {dif.fantasmas} sin IMEI
        </span>
      )}
      {dif.putaway > 0 && (
        <span className="inline-flex px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-medium" title="Recepción reciente que Andreani todavía no ingresó a su total">
          📦 {dif.putaway} putaway
        </span>
      )}
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

const PESO_ESTADO = { real: 0, nueva: 1, persistia: 1, resuelta: 2 } as const

function TablaModelos({ modelos, clasificacion }: {
  modelos: ModeloDescompuesto[]
  clasificacion: Map<string, DifClasificada>
}) {
  const filas = [...modelos].sort((a, b) => {
    const pa = a.residual !== 0 ? PESO_ESTADO[clasificacion.get(a.nombre)?.estado ?? 'nueva'] : 3
    const pb = b.residual !== 0 ? PESO_ESTADO[clasificacion.get(b.nombre)?.estado ?? 'nueva'] : 3
    return pa - pb || Math.abs(b.residual) - Math.abs(a.residual) || Math.abs(b.dif) - Math.abs(a.dif) || a.nombre.localeCompare(b.nombre)
  })
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <th className="py-2 px-3 font-medium">Modelo</th>
            <th className="py-2 px-3 font-medium text-right">Andreani disp.</th>
            <th className="py-2 px-3 font-medium text-right">GO comparable</th>
            <th className="py-2 px-3 font-medium text-right">Diferencia</th>
            <th className="py-2 px-3 font-medium">Explicado por</th>
            <th className="py-2 px-3 font-medium text-right">Residual</th>
            <th className="py-2 px-3 font-medium">Estado</th>
            <th className="py-2 px-3 font-medium text-right text-magenta-700">Disponible real</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(m => {
            const dif = m.residual !== 0 ? clasificacion.get(m.nombre) : undefined
            const esReal = dif?.estado === 'real'
            const sinDif = m.dif === 0 && m.residual === 0
            return (
              <tr key={m.nombre} className={`border-b border-gray-100 ${esReal ? 'bg-red-50/40' : m.residual !== 0 ? 'bg-amber-50/40' : ''}`}>
                <td className="py-1.5 px-3 text-gray-900">{m.nombre}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{m.andDisponible}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{m.goComparable}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">{sinDif ? <span className="text-green-600 font-medium">✓ 0</span> : <span className="text-gray-500 tabular-nums">{m.dif > 0 ? '+' : ''}{m.dif}</span>}</td>
                <td className="py-1.5 px-3">{dif ? <Desglose dif={dif} /> : <span className="text-gray-300">—</span>}</td>
                <td className="py-1.5 px-3 text-right tabular-nums"><DifBadge dif={m.residual} /></td>
                <td className="py-1.5 px-3">{dif ? <EstadoChip dif={dif} fechaDesde={fechaHora(dif.desde)} /> : <span className="text-gray-300">—</span>}</td>
                <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-magenta-700">{m.disponibleReal}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FilaCorteExpandible({ corte, modelos, clasificacion, abiertaInicial }: {
  corte: CorteControlStock
  modelos: ModeloDescompuesto[]
  clasificacion: Map<string, DifClasificada>
  abiertaInicial: boolean
}) {
  const [abierta, setAbierta] = useState(abiertaInicial)
  const difs = [...clasificacion.values()]
  const porEstado = (estado: DifClasificada['estado']) => difs.filter(d => d.estado === estado).length
  const reales = porEstado('real')
  const nuevas = porEstado('nueva')
  const persistian = porEstado('persistia')
  const resueltas = porEstado('resuelta')
  const resumen = [
    reales > 0 && `${reales} reales`,
    nuevas > 0 && `${nuevas} a confirmar`,
    persistian > 0 && `${persistian} persistían`,
    resueltas > 0 && `${resueltas} se resolvieron solas`,
  ].filter(Boolean).join(' · ')
  return (
    <div className="border border-gray-100 rounded-lg">
      <button
        onClick={() => setAbierta(a => !a)}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 rounded-lg"
      >
        <span className="text-sm font-medium text-gray-900">{fechaHora(corte.runAt)}</span>
        <span className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">{corte.filas.filter(f => f.medido).length} SKUs</span>
          <span className={reales > 0 || persistian > 0 ? 'text-red-600 font-semibold' : nuevas > 0 ? 'text-amber-600 font-semibold' : 'text-green-700 font-medium'}>
            {difs.length > 0 ? resumen : '✓ sin diferencias'}
          </span>
          <span className={`text-gray-400 transition-transform ${abierta ? 'rotate-90' : ''}`}>›</span>
        </span>
      </button>
      {abierta && (
        <div className="px-3 pb-3">
          <TablaModelos modelos={modelos} clasificacion={clasificacion} />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Andreani leído a las {fechaHora(corte.runAt)} · lado GOcelular medido a las {fechaHora(corte.corteAt)}
          </p>
        </div>
      )}
    </div>
  )
}

export default function ControlStockTable({ cortes }: { cortes: CorteControlStock[] }) {
  // Cortes ascendentes con su neto por modelo y la clasificación por
  // persistencia (hooks antes de cualquier return condicional)
  const cortesClasificados = useMemo(() => {
    const asc = [...cortes].sort((a, b) => a.runAt.localeCompare(b.runAt))
    const conModelos = asc.map(c => {
      const fantasmas = new Map(c.fantasmas.map(f => [f.nombre, f.unidades]))
      const recepciones = new Map(c.recepciones.map(r => [r.nombre, r.unidades]))
      const modelos = descomponerModelos(netoPorModelo(c.filas, c.enCola), fantasmas, recepciones)
      return { corte: c, modelos }
    })
    const clasificados = clasificarCortes(
      conModelos.map(x => ({ runAt: x.corte.runAt, modelos: x.modelos, recepciones: x.corte.recepciones })),
    )
    return conModelos.map((x, i) => ({
      ...x,
      clasificacion: new Map(clasificados[i].difs.map(d => [d.nombre, d])),
    }))
  }, [cortes])

  // Serie del gráfico y píldoras
  const serieBase = useMemo(() => {
    return cortesClasificados.map(({ corte: c, modelos }) => {
      const dif: Record<string, number> = {}
      for (const m of modelos) if (m.residual !== 0) dif[m.nombre] = m.residual
      const total = modelos.reduce((s, m) => s + Math.abs(m.residual), 0)
      return { label: fechaHora(c.runAt), dif, total }
    })
  }, [cortesClasificados])
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

  const ultimoClasificado = cortesClasificados[cortesClasificados.length - 1]
  const ultimo = ultimoClasificado.corte
  const difsUltimo = [...ultimoClasificado.clasificacion.values()]
  const reales = difsUltimo.filter(d => d.estado === 'real')
  const nuevas = difsUltimo.filter(d => d.estado === 'nueva')
  const unidadesReales = reales.reduce((s, d) => s + Math.abs(d.residual), 0)
  const unidadesNuevas = nuevas.reduce((s, d) => s + Math.abs(d.residual), 0)
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
          <p className="text-sm text-gray-500">Diferencias reales</p>
          <p className={`text-2xl font-bold mt-1 ${reales.length > 0 ? 'text-red-600' : 'text-green-700'}`}>
            {reales.length > 0 ? `${reales.length} (${unidadesReales} u.)` : '✓ 0'}
          </p>
          <p className="text-xs text-gray-400 mt-1">residual (sin fantasmas ni putaway) que persiste ≥2 cortes</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Nuevas — a confirmar</p>
          <p className={`text-2xl font-bold mt-1 ${nuevas.length > 0 ? 'text-amber-600' : 'text-green-700'}`}>
            {nuevas.length > 0 ? `${nuevas.length} (${unidadesNuevas} u.)` : '✓ 0'}
          </p>
          <p className="text-xs text-gray-400 mt-1">timing o real: se decide solo en el próximo corte</p>
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
        resumen="Un corte por corrida del job (Andreani y GOcelular medidos en el mismo momento) — cada dif viene clasificada por persistencia: las que se resolvieron solas fueron timing"
      >
        <div className="space-y-2">
          {[...cortesClasificados].reverse().map((x, i) => (
            <FilaCorteExpandible
              key={x.corte.id}
              corte={x.corte}
              modelos={x.modelos}
              clasificacion={x.clasificacion}
              abiertaInicial={i === 0}
            />
          ))}
        </div>
      </Tarjeta>

      {/* Gráfico de persistencia */}
      <Tarjeta
        titulo="Residual por corte"
        abiertaInicial
        resumen="El residual (diferencia menos fantasmas y putaway) por corte: si sobrevive corte tras corte es un faltante real; un pico aislado era lag de novedad"
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
                <th className="py-2 px-3 font-medium text-right">En cola (ctx)</th>
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
                  <td className="py-1.5 px-3 text-right tabular-nums font-medium text-gray-800">{f.go_andreani}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-400">{f.go_enviados > 0 ? f.go_enviados : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-400">{f.go_local > 0 ? f.go_local : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-400">{f.go_transito > 0 ? f.go_transito : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{f.medido ? <DifBadge dif={f.dif} /> : <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Diferencia = And. disponible (stock físico de Andreani − lo pickeado) − GO WH Andreani (available). No se
          resta la cola de enviados sin pickear: Andreani tampoco la descuenta (verificado contra el portal). La cola,
          el depósito propio y lo en tránsito son contexto, no entran en la diferencia.
        </p>
      </Tarjeta>
    </div>
  )
}
