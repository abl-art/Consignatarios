'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, ComposedChart, CartesianGrid, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import CanalPills, { type Canal } from '../../finanzas/CanalPills'
import { getProyeccionDimension, getProyeccionMarca, type MarcaFiltro } from '@/lib/actions/proyecciones'
import { fraccionMesTranscurrida, type FilaProyReal } from '@/lib/proyeccion-ventas'
import type { MerchantTercero } from '@/lib/actions/finanzas'
import { formatearMoneda } from '@/lib/utils'

// Paleta validada (dataviz): real azul, híbrido rosa, GOcuotas ámbar (línea
// punteada + tabla como refuerzo por bajo contraste del ámbar)
const COLOR_REAL = '#2563eb'
const COLOR_REAL_PARCIAL = '#93c5fd' // mes en curso: mismo azul, aclarado
const COLOR_HIBRIDO = '#e11d48'
const COLOR_GOCUOTAS = '#f59e0b'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

type Metrica = 'ventas' | 'monto'

interface Props {
  inicial: { mesActual: string; total: FilaProyReal[]; propia: FilaProyReal[]; terceros: FilaProyReal[] }
  merchants: MerchantTercero[]
}

const etiquetaMes = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5)) - 1]} ${mes.slice(2, 4)}`

// Filtro por marca (acuerdo Samsung 1/10/2026): Real = medido por marca;
// proyectado = proyección del canal × share de la marca (últimos 3 meses cerrados)
const MARCAS: { id: MarcaFiltro; label: string }[] = [
  { id: 'samsung', label: 'Samsung' },
  { id: 'motorola', label: 'Motorola' },
  { id: 'xiaomi', label: 'Xiaomi' },
  { id: 'otras', label: 'Otras' },
]

function fmt(valor: number, metrica: Metrica): string {
  return metrica === 'monto' ? formatearMoneda(Math.round(valor)) : Math.round(valor).toLocaleString('es-AR')
}

function Dif({ real, proy, metrica }: { real: number; proy: number; metrica: Metrica }) {
  if (proy === 0) return <span className="text-gray-400">—</span>
  const pct = ((real - proy) / proy) * 100
  const clase = pct >= 0 ? 'text-emerald-600' : 'text-rose-600'
  return (
    <span className={`font-medium ${clase}`} title={`Proyectado ${fmt(proy, metrica)} · Real ${fmt(real, metrica)}`}>
      {pct >= 0 ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  )
}

export default function ProyeccionClient({ inicial, merchants }: Props) {
  const [canal, setCanal] = useState<Canal>('total')
  const [merchantId, setMerchantId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [metrica, setMetrica] = useState<Metrica>('ventas')
  const [marca, setMarca] = useState<'todas' | MarcaFiltro>('todas')
  const [cache, setCache] = useState<Record<string, FilaProyReal[]>>({})
  const [marcaCache, setMarcaCache] = useState<Record<string, { filas: FilaProyReal[]; share: number }>>({})
  const [cargando, setCargando] = useState(false)

  const claveDim = storeId ? `store:${storeId}` : merchantId ? `merchant:${merchantId}` : ''
  const claveMarca = marca !== 'todas' ? `${canal}:${marca}` : ''

  useEffect(() => {
    if (!claveMarca || marcaCache[claveMarca]) return
    let vigente = true
    setCargando(true)
    getProyeccionMarca(marca as MarcaFiltro, canal)
      .then((r) => {
        if (vigente) setMarcaCache((c) => ({ ...c, [claveMarca]: r }))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [claveMarca, marca, canal, marcaCache])

  useEffect(() => {
    if (canal !== 'terceros' || !claveDim || cache[claveDim]) return
    let vigente = true
    setCargando(true)
    const dim = storeId
      ? ({ nivel: 'store', storeId } as const)
      : ({ nivel: 'merchant', clientId: merchantId } as const)
    getProyeccionDimension(dim)
      .then((filas) => {
        if (vigente) setCache((c) => ({ ...c, [claveDim]: filas }))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [canal, claveDim, merchantId, storeId, cache])

  const filas: FilaProyReal[] = claveMarca
    ? marcaCache[claveMarca]?.filas ?? []
    : canal === 'terceros' && claveDim
      ? cache[claveDim] ?? []
      : inicial[canal === 'propia' ? 'propia' : canal === 'terceros' ? 'terceros' : 'total']
  const shareMarca = claveMarca ? marcaCache[claveMarca]?.share : undefined

  const merchantSel = merchants.find((m) => m.clientId === merchantId)

  // Etiquetas sobre cada punto del gráfico: monto compacto en $M, unidades enteras
  const fmtEtiqueta = (v: unknown) =>
    typeof v === 'number'
      ? metrica === 'monto'
        ? `$${(v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}M`
        : v.toLocaleString('es-AR')
      : ''

  const datosChart = useMemo(
    () =>
      filas.map((f) => ({
        mes: etiquetaMes(f.mes),
        Real: f.real ? Math.round(f.real[metrica]) : null,
        // el mes en curso se va completando con el acumulado al día
        'Real en curso': f.realParcial ? Math.round(f.realParcial[metrica]) : null,
        'Proy. Híbrido': f.hibrido ? Math.round(f.hibrido[metrica]) : null,
        'Proy. GOcuotas': f.gocuotas ? Math.round(f.gocuotas[metrica]) : null,
      })),
    [filas, metrica]
  )

  // Para la dif del mes en curso: proyección prorrateada a los días transcurridos
  const fraccionMes = fraccionMesTranscurrida(new Date().toISOString())

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CanalPills canal={canal} onChange={(c) => { setCanal(c); setMerchantId(''); setStoreId('') }} />
        <div className="flex gap-1">
          {([{ id: 'todas' as const, label: 'Todas las marcas' }, ...MARCAS]).map((m) => (
            <button
              key={m.id}
              onClick={() => { setMarca(m.id); setMerchantId(''); setStoreId('') }}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                marca === m.id ? 'bg-indigo-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {shareMarca !== undefined && (
          <span className="text-xs text-gray-500" title="Participación de la marca en el canal, últimos 3 meses cerrados — con ese share se escala la proyección del canal">
            share 3m: <b>{(shareMarca * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%</b>
          </span>
        )}
        {marca === 'todas' && canal === 'terceros' && (
          <>
            <select
              value={merchantId}
              onChange={(e) => { setMerchantId(e.target.value); setStoreId('') }}
              className="text-xs border border-gray-200 rounded-full px-3 py-1 bg-white text-gray-700"
            >
              <option value="">Todos los merchants</option>
              {merchants.map((m) => (
                <option key={m.clientId} value={m.clientId}>{m.nombre}</option>
              ))}
            </select>
            {merchantSel && merchantSel.stores.length > 1 && (
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="text-xs border border-gray-200 rounded-full px-3 py-1 bg-white text-gray-700"
              >
                <option value="">Todas las stores</option>
                {merchantSel.stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            )}
          </>
        )}
        <div className="flex gap-1 ml-auto">
          {(['ventas', 'monto'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetrica(m)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                metrica === m ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m === 'ventas' ? 'Unidades' : 'Monto'}
            </button>
          ))}
        </div>
      </div>

      {cargando && <p className="text-xs text-gray-400">Cargando dimensión…</p>}

      {filas.length === 0 && !cargando ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Sin proyecciones para esta selección todavía — las dimensiones nuevas entran en el próximo run mensual.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Proyectado vs Real · {metrica === 'ventas' ? 'unidades' : 'monto'}
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={datosChart} margin={{ top: 20, right: 15, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                    tickFormatter={(v: number) =>
                      metrica === 'monto' ? `$${(v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })}M` : v.toLocaleString('es-AR')
                    }
                  />
                  <Tooltip
                    formatter={(v) => (typeof v === 'number' ? fmt(v, metrica) : String(v ?? ''))}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Real" stackId="real" fill={COLOR_REAL} radius={[4, 4, 0, 0]} maxBarSize={36}>
                    <LabelList dataKey="Real" position="top" formatter={fmtEtiqueta} style={{ fontSize: 10, fill: '#1e40af', fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="Real en curso" stackId="real" fill={COLOR_REAL_PARCIAL} radius={[4, 4, 0, 0]} maxBarSize={36}>
                    <LabelList dataKey="Real en curso" position="top" formatter={fmtEtiqueta} style={{ fontSize: 10, fill: '#1e40af', fontWeight: 600 }} />
                  </Bar>
                  <Line type="monotone" dataKey="Proy. Híbrido" stroke={COLOR_HIBRIDO} strokeWidth={2} dot={{ r: 4 }}>
                    <LabelList dataKey="Proy. Híbrido" position="top" offset={10} formatter={fmtEtiqueta} style={{ fontSize: 10, fill: '#be123c', fontWeight: 600 }} />
                  </Line>
                  <Line type="monotone" dataKey="Proy. GOcuotas" stroke={COLOR_GOCUOTAS} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4 }}>
                    <LabelList dataKey="Proy. GOcuotas" position="bottom" offset={10} formatter={fmtEtiqueta} style={{ fontSize: 10, fill: '#b45309', fontWeight: 600 }} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">Mes</th>
                  <th className="px-4 py-3 font-medium text-right">Real</th>
                  <th className="px-4 py-3 font-medium text-right">Proy. Híbrido</th>
                  <th className="px-4 py-3 font-medium text-right">Dif</th>
                  <th className="px-4 py-3 font-medium text-right">Proy. GOcuotas</th>
                  <th className="px-4 py-3 font-medium text-right">Dif</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const futuro = f.real === null
                  const enCurso = f.realParcial !== null
                  const difDe = (proy: { ventas: number; monto: number } | null) => {
                    if (!proy) return <>—</>
                    if (f.real) return <Dif real={f.real[metrica]} proy={proy[metrica]} metrica={metrica} />
                    if (f.realParcial)
                      return <Dif real={f.realParcial[metrica]} proy={proy[metrica] * fraccionMes} metrica={metrica} />
                    return <>—</>
                  }
                  return (
                    <tr key={f.mes} className={`border-b border-gray-50 ${futuro ? 'text-gray-500' : 'text-gray-900'}`}>
                      <td className="px-4 py-2.5 font-medium">
                        {etiquetaMes(f.mes)}
                        {futuro && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">
                            {enCurso ? 'en curso' : 'proy.'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {f.real
                          ? fmt(f.real[metrica], metrica)
                          : f.realParcial
                            ? <span className="text-blue-700" title="Acumulado al día de hoy">{fmt(f.realParcial[metrica], metrica)}</span>
                            : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">{f.hibrido ? fmt(f.hibrido[metrica], metrica) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">{difDe(f.hibrido)}</td>
                      <td className="px-4 py-2.5 text-right">{f.gocuotas ? fmt(f.gocuotas[metrica], metrica) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">{difDe(f.gocuotas)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-gray-400">
              La proyección de cada mes es la del run congelado más reciente que no lo vio (run del día 1 del mismo mes). Dif = real
              vs proyectado: verde superó la proyección, rojo quedó abajo. El mes en curso muestra el acumulado al día (barra celeste)
              y su dif se calcula contra la proyección prorrateada a los días transcurridos; los meses futuros muestran la proyección vigente.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
