'use client'

// Stock Options de Grupo GO (opcion clasica: la persona cobra la DIFERENCIA
// entre el valor actual de su paquete y el valor al ingreso, devengada segun
// cliff + periodo + frecuencia). Pensada para mostrarsela a la persona en una
// reunion: numeros grandes, explicacion en una linea y panel por persona.

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import {
  getStockOptions, agregarStockOption, eliminarStockOption,
  getValuacionesEmpresa, agregarValuacionEmpresa,
  getContratosMeta, subirContrato, descargarContrato,
  cerrarStockOption, reabrirStockOption, editarStockOption,
} from '@/lib/actions/stock-options'
import {
  calcularPaquete, proximoHito, ultimaValuacion, rowToGrant,
  filasPorAnio, esquemaParejo, fechaCalculo, indicadores, profitPorPersona,
  type EsquemaAnio, type StockOptionRow, type ValuacionEmpresa,
} from '@/lib/stock-options'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

// Colores del grafico validados con dataviz (CVD y contraste OK sobre blanco)
const COLOR_ACUMULADO = '#2563eb' // profit acumulado: vigentes y conservadas
const COLOR_LIQUIDADO = '#e11d48' // profit liquidado: recompras pagadas

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const pct = (n: number, dec = 1) => `${(n * 100).toFixed(dec)}%`
const fecha = (d: string) => {
  const p = d.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d
}

export default function StockOptionsPage() {
  const [rows, setRows] = useState<StockOptionRow[]>([])
  const [valuaciones, setValuaciones] = useState<ValuacionEmpresa[]>([])
  const [contratos, setContratos] = useState<Map<number, { filename: string; updated_at: string }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [panelId, setPanelId] = useState<number | null>(null)
  const [cierreId, setCierreId] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [listaAbierta, setListaAbierta] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showVal, setShowVal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [so, vals, metas] = await Promise.all([getStockOptions(), getValuacionesEmpresa(), getContratosMeta()])
    setRows(so)
    setValuaciones(vals)
    setContratos(new Map(metas.map(m => [m.option_id, { filename: m.filename, updated_at: m.updated_at }])))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const valActual = ultimaValuacion(valuaciones)
  const valUsd = valActual ? Number(valActual.valuacion_usd) : null
  const hoy = new Date()
  const panel = panelId !== null ? rows.find(r => r.id === panelId) : undefined
  const cierre = cierreId !== null ? rows.find(r => r.id === cierreId) : undefined
  const ind = indicadores(rows, hoy)
  const profits = profitPorPersona(rows, valUsd, hoy)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-1">
        <Link href="/grupo-go" className="text-gray-400 hover:text-gray-600 text-sm">&larr; Grupo GO</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Stock Options</h1>
      <p className="text-sm text-gray-500 mb-6">
        Paquetes por persona, devengamiento y valor a la valuacion actual de la empresa
      </p>
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">Cargando datos...</p>
        </div>
      ) : (
      <div className="space-y-6">
      {/* Card: valuacion actual de la empresa */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Valuacion actual de GOcuotas</h2>
            {valActual ? (
              <p className="mt-1">
                <span className="text-2xl font-bold text-gray-900">{fmt(Number(valActual.valuacion_usd))}</span>
                <span className="text-xs text-gray-500 ml-2">al {fecha(valActual.fecha)}{valActual.nota ? ` · ${valActual.nota}` : ''}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-400 mt-1">Sin valuacion cargada — cargala para calcular las diferencias</p>
            )}
          </div>
          <button onClick={() => setShowVal(!showVal)} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">
            {showVal ? 'Cancelar' : 'Actualizar valuacion'}
          </button>
        </div>
        {showVal && <FormValuacion onDone={() => { setShowVal(false); cargar() }} />}
        {valuaciones.length > 1 && (
          <div className="px-6 py-2 border-t border-gray-100 text-[11px] text-gray-400">
            Historial: {valuaciones.slice(0, 6).map(v => `${fecha(v.fecha)} ${fmt(Number(v.valuacion_usd))}`).join(' · ')}
          </div>
        )}
      </div>

      {/* Cards: % de la empresa comprometido y gasto en recompras */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Dato label="% empresa comprometido en SO" valor={pct(ind.comprometido, 3)} />
        <Dato label="Ya devengado" valor={pct(ind.devengado, 3)} />
        <Dato label="Por devengar" valor={pct(ind.porDevengar, 3)} />
        <Dato label="Gastado en recompras" valor={fmt(ind.gastoRecompras)} />
      </div>

      {/* Card: grafico de profit por persona */}
      {profits.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Profit por persona</h2>
              <p className="text-xs text-gray-500 mt-0.5">A valuacion actual; las recompras quedan congeladas en lo pagado</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COLOR_ACUMULADO }} /> Acumulado (no vendieron)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COLOR_LIQUIDADO }} /> Liquidado (recompra)</span>
            </div>
          </div>
          <div className="px-4 py-4">
            <ResponsiveContainer width="100%" height={Math.max(120, profits.length * 44 + 30)}>
              <BarChart data={profits} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 10 }}>
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
                  stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 11 }}
                />
                <YAxis type="category" dataKey="nombre" width={140} stroke="#e5e7eb" tick={{ fill: '#374151', fontSize: 12 }} />
                <Tooltip
                  formatter={(v, _n, item) => {
                    const tipo = (item as { payload?: { tipo?: string } })?.payload?.tipo
                    return [fmt(Number(v)), tipo === 'liquidado' ? 'Profit liquidado (recompra)' : 'Profit acumulado']
                  }}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Bar dataKey="monto" barSize={18} radius={[0, 4, 4, 0]}
                  label={{ position: 'right', fill: '#374151', fontSize: 11, formatter: (v) => (Number(v) > 0 ? fmt(Number(v)) : '') }}>
                  {profits.map((p, i) => (
                    <Cell key={i} fill={p.tipo === 'liquidado' ? COLOR_LIQUIDADO : COLOR_ACUMULADO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Card: personas (colapsable) */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <button onClick={() => setListaAbierta(!listaAbierta)} className="text-left group">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide group-hover:text-gray-900">
              <span className="inline-block w-4 text-gray-400">{listaAbierta ? '▾' : '▸'}</span>
              Personas ({rows.length})
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 ml-4">
              Cobra la diferencia entre el valor actual del paquete y su valor al ingreso, segun devengamiento
            </p>
          </button>
          <button onClick={() => { setShowForm(!showForm); if (!showForm) setListaAbierta(true) }} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">
            {showForm ? 'Cancelar' : '+ Agregar persona'}
          </button>
        </div>

        {listaAbierta && (<>
        {showForm && <FormPersona onDone={() => { setShowForm(false); cargar() }} />}
        {editId !== null && rows.find(r => r.id === editId) && (
          <div className="border-b border-gray-200">
            <div className="px-6 pt-3 flex items-center justify-between bg-gray-50">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Editando a {rows.find(r => r.id === editId)!.nombre}
              </span>
              <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ cancelar</button>
            </div>
            <FormPersona key={editId} inicial={rows.find(r => r.id === editId)!} onDone={() => { setEditId(null); cargar() }} />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-gray-500 text-sm">Todavia no hay stock options cargadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Persona</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Otorgado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase" title="Sueldo mensual USD x multiplo">Paquete base</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Devengado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase" title="Diferencia total a valuacion actual">Diferencia</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase" title="Diferencia x devengado: lo que cobraria HOY">Cobra hoy</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-[150px]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const g = rowToGrant(r)
                  const c = calcularPaquete(g, valUsd, fechaCalculo(r, hoy))
                  const esRecompra = r.cierre_tipo === 'recompra'
                  return (
                    <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${r.cierre_tipo ? 'opacity-80' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.nombre}
                        {r.cierre_tipo && (
                          <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${esRecompra ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {esRecompra ? 'Recomprada' : 'Conserva'} {r.cierre_fecha ? fecha(r.cierre_fecha) : ''}
                          </span>
                        )}
                        <span className="block text-[10px] font-normal text-gray-400">
                          {g.multiplo}x sueldo · cliff {g.cliffAnios} {g.cliffAnios === 1 ? 'año' : 'años'} · {g.periodoAnios} años, esquema anual
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fecha(r.fecha_otorgamiento)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(c.base)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{pct(c.fraccionDevengada)}{r.cierre_tipo ? ' ❄' : ''}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{c.diferenciaTotal === null ? '—' : fmt(c.diferenciaTotal)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${esRecompra ? 'text-rose-700' : c.diferenciaDevengada ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {esRecompra ? fmt(Number(r.cierre_monto_usd) || 0) : c.diferenciaDevengada === null ? '—' : fmt(c.diferenciaDevengada)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button onClick={() => setPanelId(r.id)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mr-3">Ver panel</button>
                        <button onClick={() => { setEditId(r.id); setShowForm(false) }} className="text-gray-600 hover:text-gray-900 text-xs font-medium mr-3">Editar</button>
                        {r.cierre_tipo ? (
                          <button
                            onClick={async () => {
                              if (!confirm(`Reabrir el grant de ${r.nombre}? Vuelve a devengar como vigente.`)) return
                              const res = await reabrirStockOption(r.id)
                              if (res.error) setError(res.error)
                              cargar()
                            }}
                            className="text-amber-600 hover:text-amber-800 text-xs font-medium mr-3"
                          >Reabrir</button>
                        ) : (
                          <button onClick={() => setCierreId(r.id)} className="text-gray-600 hover:text-gray-900 text-xs font-medium mr-3">Cerrar</button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm(`Eliminar las stock options de ${r.nombre}?`)) return
                            await eliminarStockOption(r.id)
                            cargar()
                          }}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >Eliminar</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        </>)}
        {error && <div className="px-6 py-3 text-sm text-red-600">{error}</div>}
      </div>

      {cierre && (
        <CierreModal
          row={cierre}
          valuacionUsd={valUsd}
          onClose={() => setCierreId(null)}
          onDone={() => { setCierreId(null); cargar() }}
        />
      )}

      {panel && (
        <PanelPersona
          row={panel}
          valuacion={valActual}
          contrato={contratos.get(panel.id) ?? null}
          onClose={() => setPanelId(null)}
          onChange={cargar}
          onError={setError}
        />
      )}
      </div>
      )}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 font-medium block mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none'

function FormValuacion({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState('')
  const [v, setV] = useState('')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Campo label="Fecha"><input type="date" value={f} onChange={e => setF(e.target.value)} className={inputCls} /></Campo>
        <Campo label="Valuacion (USD)"><input type="number" value={v} onChange={e => setV(e.target.value)} placeholder="25000000" className={inputCls} /></Campo>
        <Campo label="Nota (opcional)"><input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: ronda serie A" className={inputCls} /></Campo>
      </div>
      {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
      <button
        onClick={async () => {
          setSaving(true); setErr(null)
          const r = await agregarValuacionEmpresa(f, parseFloat(v), nota)
          if (r.error) setErr(r.error); else onDone()
          setSaving(false)
        }}
        disabled={saving}
        className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
      >{saving ? 'Guardando...' : 'Guardar valuacion'}</button>
    </div>
  )
}

function FormPersona({ inicial, onDone }: { inicial?: StockOptionRow; onDone: () => void }) {
  const [v, setV] = useState(inicial ? {
    nombre: inicial.nombre,
    fecha: inicial.fecha_otorgamiento,
    sueldo: String(Number(inicial.sueldo_mensual_usd)),
    multiplo: String(Number(inicial.multiplo)),
    valuacion: String(Number(inicial.valuacion_ingreso_usd)),
    cliff: String(Number(inicial.cliff_anios)),
    periodo: String(Number(inicial.periodo_anios)),
  } : { nombre: '', fecha: '', sueldo: '', multiplo: '12', valuacion: '', cliff: '1', periodo: '4' })
  const [esquema, setEsquema] = useState<EsquemaAnio[]>(
    inicial && Array.isArray(inicial.esquema) && inicial.esquema.length > 0 ? inicial.esquema : esquemaParejo(inicial ? Number(inicial.periodo_anios) : 4)
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })

  // Al cambiar el periodo se regenera la tabla de anios (pareja por default, despues la edita)
  const setPeriodo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const periodo = e.target.value
    setV({ ...v, periodo })
    const n = parseInt(periodo)
    if (n >= 1 && n <= 30) setEsquema(esquemaParejo(n))
  }
  const setPct = (anio: number, pct: string) =>
    setEsquema(esquema.map(x => x.anio === anio ? { ...x, pct: pct === '' ? 0 : parseFloat(pct) } : x))

  const suma = esquema.reduce((s, x) => s + (Number(x.pct) || 0), 0)
  const sumaOk = Math.abs(suma - 100) <= 0.01

  return (
    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Campo label="Nombre y apellido"><input type="text" value={v.nombre} onChange={set('nombre')} placeholder="Ej: Juan Perez" className={inputCls} /></Campo>
        <Campo label="Fecha de otorgamiento"><input type="date" value={v.fecha} onChange={set('fecha')} className={inputCls} /></Campo>
        <Campo label="Sueldo mensual al ingreso (USD)"><input type="number" value={v.sueldo} onChange={set('sueldo')} placeholder="2000" className={inputCls} /></Campo>
        <Campo label="Multiplo del sueldo"><input type="number" value={v.multiplo} onChange={set('multiplo')} className={inputCls} /></Campo>
        <Campo label="Valuacion de la empresa al ingreso (USD)"><input type="number" value={v.valuacion} onChange={set('valuacion')} placeholder="10000000" className={inputCls} /></Campo>
        <Campo label="Cliff (años)"><input type="number" min="0" value={v.cliff} onChange={set('cliff')} className={inputCls} /></Campo>
        <Campo label="Periodo total (años)"><input type="number" min="1" max="30" value={v.periodo} onChange={setPeriodo} className={inputCls} /></Campo>
      </div>

      {/* Esquema de devengamiento por anio: que % devenga cada anio (suma 100) */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 font-medium">Esquema de devengamiento — % del paquete que devenga cada año</span>
          <span className={`text-xs font-bold ${sumaOk ? 'text-emerald-700' : 'text-red-600'}`}>
            Total: {suma.toFixed(2)}% {sumaOk ? '✓' : '(debe sumar 100%)'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {esquema.map(x => (
            <div key={x.anio} className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 w-[92px]">
              <div className="text-[10px] text-gray-400 mb-0.5">Año {x.anio}</div>
              <div className="flex items-center gap-1">
                <input
                  type="number" min="0" max="100" step="0.01" value={x.pct}
                  onChange={e => setPct(x.anio, e.target.value)}
                  className="w-full text-sm font-semibold text-gray-900 outline-none"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
      <button
        onClick={async () => {
          setSaving(true); setErr(null)
          const input = {
            nombre: v.nombre, fechaOtorgamiento: v.fecha,
            sueldoMensualUsd: parseFloat(v.sueldo), multiplo: parseFloat(v.multiplo),
            valuacionIngresoUsd: parseFloat(v.valuacion),
            cliffAnios: parseInt(v.cliff), periodoAnios: parseInt(v.periodo),
            esquema,
          }
          const r = inicial ? await editarStockOption(inicial.id, input) : await agregarStockOption(input)
          if (r.error) setErr(r.error); else onDone()
          setSaving(false)
        }}
        disabled={saving || !sumaOk}
        className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
      >{saving ? 'Guardando...' : inicial ? 'Guardar cambios' : 'Guardar persona'}</button>
    </div>
  )
}

// Cierre por salida del colaborador: fecha + recompra (pagamos lo devengado,
// congelado) o conserva (mantiene lo devengado; el resto vuelve a la empresa)
function CierreModal({ row, valuacionUsd, onClose, onDone }: {
  row: StockOptionRow
  valuacionUsd: number | null
  onClose: () => void
  onDone: () => void
}) {
  const [f, setF] = useState(new Date().toISOString().slice(0, 10))
  const [tipo, setTipo] = useState<'recompra' | 'conserva'>('recompra')
  const [monto, setMonto] = useState('')
  const [montoTocado, setMontoTocado] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const g = rowToGrant(row)
  const corte = f ? new Date(`${f}T00:00:00Z`) : new Date()
  const c = calcularPaquete(g, valuacionUsd, corte)
  const sugerido = c.diferenciaDevengada
  const montoFinal = montoTocado && monto !== '' ? parseFloat(monto) : (sugerido ?? 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Cerrar grant — {row.nombre}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Deja de devengar en la fecha de cierre</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2 py-1">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <Campo label="Fecha de cierre (ultimo dia)">
            <input type="date" value={f} onChange={e => setF(e.target.value)} className={inputCls} />
          </Campo>
          <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
            A esa fecha tiene devengado <b>{pct(c.fraccionDevengada)}</b>
            {sugerido !== null && <> → diferencia devengada <b>{fmt(sugerido)}</b> (a valuacion actual)</>}
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" checked={tipo === 'recompra'} onChange={() => setTipo('recompra')} className="mt-0.5" />
              <span><b>Recompramos</b> — la empresa paga lo devengado, recupera el % y el pago suma al indicador de recompras</span>
            </label>
            {tipo === 'recompra' && (
              <div className="ml-6">
                <Campo label="Monto pagado (USD)">
                  <input
                    type="number" min="0"
                    value={montoTocado ? monto : (sugerido === null ? '' : String(Math.round(montoFinal)))}
                    onChange={e => { setMontoTocado(true); setMonto(e.target.value) }}
                    placeholder={sugerido === null ? 'sin valuacion actual — cargalo a mano' : undefined}
                    className={inputCls}
                  />
                </Campo>
              </div>
            )}
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" checked={tipo === 'conserva'} onChange={() => setTipo('conserva')} className="mt-0.5" />
              <span><b>Las conserva</b> — mantiene lo devengado (sigue valuandose con la empresa); lo no devengado vuelve a la empresa</span>
            </label>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button
            onClick={async () => {
              setSaving(true); setErr(null)
              const r = await cerrarStockOption(row.id, f, tipo, tipo === 'recompra' ? montoFinal : null)
              if (r.error) setErr(r.error); else onDone()
              setSaving(false)
            }}
            disabled={saving}
            className="w-full px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >{saving ? 'Guardando...' : 'Confirmar cierre'}</button>
        </div>
      </div>
    </div>
  )
}

function Dato({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${destaque ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${destaque ? 'text-emerald-700' : 'text-gray-900'}`}>{valor}</div>
    </div>
  )
}

function PanelPersona({ row, valuacion, contrato, onClose, onChange, onError }: {
  row: StockOptionRow
  valuacion: ValuacionEmpresa | null
  contrato: { filename: string; updated_at: string } | null
  onClose: () => void
  onChange: () => void
  onError: (e: string | null) => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const g = rowToGrant(row)
  // El cierre congela el reloj del devengamiento (la valuacion sigue viva para conserva)
  const hoy = fechaCalculo(row, new Date())
  const valUsd = valuacion ? Number(valuacion.valuacion_usd) : null
  const c = calcularPaquete(g, valUsd, hoy)
  const hito = row.cierre_tipo ? null : proximoHito(g, hoy)
  const filas = filasPorAnio(g, valUsd, hoy)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    onError(null)
    const buf = await file.arrayBuffer()
    let binario = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binario += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
    }
    const r = await subirContrato(row.id, file.name, file.type || 'application/pdf', btoa(binario))
    if (r.error) onError(r.error)
    else onChange()
    setSubiendo(false)
  }

  async function onDescargar() {
    const r = await descargarContrato(row.id)
    if ('error' in r) { onError(r.error); return }
    const bin = atob(r.dataBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = r.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between sticky top-0 bg-white rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{row.nombre}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Otorgado el {fecha(row.fecha_otorgamiento)} · {g.multiplo}x sueldo · cliff {g.cliffAnios} {g.cliffAnios === 1 ? 'año' : 'años'} · {g.periodoAnios} años, esquema anual
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2 py-1">✕</button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {row.cierre_tipo && (
            <p className={`text-sm rounded-lg p-3 border ${row.cierre_tipo === 'recompra' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {row.cierre_tipo === 'recompra'
                ? <>Grant cerrado por <b>recompra</b> el {row.cierre_fecha ? fecha(row.cierre_fecha) : '—'}: se le pago <b>{fmt(Number(row.cierre_monto_usd) || 0)}</b> y el % volvio a la empresa.</>
                : <>Grant cerrado el {row.cierre_fecha ? fecha(row.cierre_fecha) : '—'}: <b>conserva lo devengado</b> ({pct(c.fraccionDevengada)}), que sigue valuandose con la empresa; el resto volvio a la empresa.</>}
            </p>
          )}
          <p className="text-sm text-gray-600 bg-pink-50 border border-pink-100 rounded-lg p-3">
            El paquete vale <b>{fmt(c.base)}</b> al ingreso ({pct(c.fraccionEmpresa, 3)} de la empresa a {fmt(g.valuacionIngresoUsd)}).
            Al ejercer, cobra la <b>diferencia</b> entre el valor actual del paquete y ese valor inicial, en la proporcion ya devengada.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Dato label="Paquete base (sueldo x multiplo)" valor={fmt(c.base)} />
            <Dato label="% de la empresa" valor={pct(c.fraccionEmpresa, 3)} />
            <Dato label="Valor actual del paquete" valor={c.valorActualPaquete === null ? '—' : fmt(c.valorActualPaquete)} />
            <Dato label="Diferencia total (100% devengado)" valor={c.diferenciaTotal === null ? '—' : fmt(c.diferenciaTotal)} />
            <Dato label="Devengado a hoy" valor={pct(c.fraccionDevengada)} />
            <Dato label="Cobraria HOY" valor={c.diferenciaDevengada === null ? '—' : fmt(c.diferenciaDevengada)} destaque />
          </div>

          {valuacion === null && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Sin valuacion actual de la empresa cargada: se muestran solo los datos estructurales. Cargala en la card de arriba.
            </p>
          )}

          <div>
            <div className="flex justify-between text-[11px] text-gray-500 mb-1">
              <span>Devengamiento</span>
              <span>{pct(c.fraccionDevengada)} de {g.periodoAnios} años</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-pink-500 rounded-full" style={{ width: `${Math.min(100, c.fraccionDevengada * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              {hito
                ? <>Proximo hito: <b>{fecha(hito.fecha)}</b> → pasa a {pct(hito.fraccion)} devengado</>
                : 'Periodo completo: 100% devengado.'}
            </p>
          </div>

          {/* Tabla año por año: que devenga, % de la empresa y que va ganando */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Año por año</h3>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Año</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Cierra</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Devenga</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Acum.</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase" title="Porcentaje de la empresa que le corresponde acumulado a ese año">% empresa</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase" title="Diferencia que suma ese año a valuación actual">Gana en el año</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase" title="Diferencia acumulada cobrable al cierre de ese año">Cobrable acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f.anio} className={`border-b border-gray-100 last:border-b-0 ${f.cumplido ? 'bg-emerald-50/50' : ''}`}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        Año {f.anio}
                        {f.cumplido && <span className="text-emerald-600 ml-1" title="Año ya cumplido">✓</span>}
                        {f.preCliff && <span className="block text-[10px] text-amber-600">se cobra al cliff</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{fecha(f.fecha)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{f.pct}%</td>
                      <td className="px-3 py-2 text-right text-gray-700">{f.pctAcumulado.toFixed(f.pctAcumulado % 1 ? 2 : 0)}%</td>
                      <td className="px-3 py-2 text-right text-gray-700">{pct(f.fraccionEmpresaAcum, 4)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{f.ganaEnElAnio === null ? '—' : fmt(f.ganaEnElAnio)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${f.cumplido && !f.preCliff ? 'text-emerald-700' : 'text-gray-900'}`}>
                        {f.acumuladoCobrable === null ? '—' : fmt(f.acumuladoCobrable)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              "Gana en el año" y "Cobrable" calculados a la valuación actual de la empresa; cambian cuando la actualices.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contrato firmado</h3>
            {contrato ? (
              <p className="text-sm text-gray-700 mb-2">
                <button onClick={onDescargar} className="text-indigo-600 hover:text-indigo-800 underline decoration-dotted">{contrato.filename}</button>
                <span className="text-xs text-gray-400 ml-2">subido el {fecha(contrato.updated_at.slice(0, 10))}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-400 mb-2">Sin contrato cargado.</p>
            )}
            <label className="inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 cursor-pointer">
              {subiendo ? 'Subiendo...' : contrato ? 'Reemplazar contrato' : 'Subir contrato (PDF)'}
              <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={onFile} disabled={subiendo} />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
