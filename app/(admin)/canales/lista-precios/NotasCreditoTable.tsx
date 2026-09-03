'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PROVEEDOR_NC, type GrupoNC } from '@/lib/notas-credito'
import { setNcEmitida } from '@/lib/actions/lista-precios-canales'

const peso = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y.slice(2)}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function mesLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-')
  return `${MESES[Number(m) - 1] ?? m} ${y}`
}

const ESTADO_CAMPANIA: Record<string, { label: string; cls: string }> = {
  vigente: { label: 'Vigente', cls: 'bg-green-50 text-green-700 border-green-200' },
  agotado: { label: 'Cupo alcanzado', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  vencido: { label: 'Vencido', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  futuro: { label: 'Futuro', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}

function Tarjeta({ titulo, monto, detalle, cls }: { titulo: string; monto: number; detalle: string; cls?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${cls ?? 'text-gray-900'}`}>{peso(monto)}</p>
      <p className="text-xs text-gray-400 mt-1">{detalle}</p>
    </div>
  )
}

function CheckEmitida({ grupo }: { grupo: GrupoNC }) {
  const router = useRouter()
  const [guardando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = (checked: boolean) => {
    setError(null)
    startTransition(async () => {
      const r = await setNcEmitida(grupo.campanias.map(c => c.id), checked)
      if (r?.error) setError(r.error)
      router.refresh()
    })
  }

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none" title="La marca ya emitió esta NC: no hay que reclamarla">
      <input
        type="checkbox"
        checked={grupo.emitida}
        disabled={guardando}
        onChange={e => toggle(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
      />
      <span className={`text-xs font-medium ${grupo.emitida ? 'text-green-700' : 'text-gray-400'}`}>
        {guardando ? 'Guardando…' : grupo.emitida ? 'Emitida' : 'Pendiente'}
      </span>
      {error && <span className="text-xs text-red-600" title={error}>⚠</span>}
    </label>
  )
}

// Las 4 marcas con bono sell-out se muestran siempre, tengan o no acciones
const MARCAS_FIJAS = Object.keys(PROVEEDOR_NC)

export default function NotasCreditoTable({ grupos }: { grupos: GrupoNC[] }) {
  const [mes, setMes] = useState<string | null>(null)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  if (grupos.length === 0) {
    return <p className="text-sm text-gray-500">Todavía no hay bonos cargados, así que no hay notas de crédito que reclamar.</p>
  }

  const mesesDisponibles = [...new Set(grupos.flatMap(g => g.meses))].sort().reverse()
  const visibles = mes ? grupos.filter(g => g.meses.includes(mes)) : grupos

  const total = visibles.reduce((acc, g) => acc + g.ncTotal, 0)
  const emitidas = visibles.filter(g => g.emitida).reduce((acc, g) => acc + g.ncTotal, 0)

  const marcas = [...MARCAS_FIJAS, ...new Set(visibles.map(g => g.marca).filter(m => !MARCAS_FIJAS.includes(m)))]

  const toggleAbierto = (key: string) => {
    setAbiertos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {[null, ...mesesDisponibles].map(m => (
          <button
            key={m ?? 'todos'}
            onClick={() => setMes(m)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              mes === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {m ? mesLabel(m) : 'Todos'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Tarjeta titulo="Total NC a recibir" monto={total} detalle={mes ? `Acciones de ${mesLabel(mes)}` : 'Todas las acciones, al día de hoy'} />
        <Tarjeta titulo="Ya emitidas" monto={emitidas} detalle="NC que la marca ya emitió" cls="text-green-700" />
        <Tarjeta titulo="Pendientes de reclamo" monto={total - emitidas} detalle="Todavía sin emitir — a reclamar" cls="text-amber-600" />
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-2">Acciones por marca</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6 max-w-2xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Marca</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Acciones</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Unidades</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">NC total</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Pendiente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {marcas.map(marca => {
              const deMarca = visibles.filter(g => g.marca === marca)
              const ncMarca = deMarca.reduce((acc, g) => acc + g.ncTotal, 0)
              const pendMarca = deMarca.filter(g => !g.emitida).reduce((acc, g) => acc + g.ncTotal, 0)
              return (
                <tr key={marca} className={`hover:bg-gray-50 ${deMarca.length === 0 ? 'text-gray-300' : ''}`}>
                  <td className="px-4 py-2">
                    <span className={`font-medium ${deMarca.length ? 'text-gray-900' : 'text-gray-400'}`}>{marca}</span>
                    <span className="block text-xs text-gray-400">{PROVEEDOR_NC[marca] ?? marca}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{deMarca.length || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{deMarca.length ? deMarca.reduce((a, g) => a + g.unidades, 0) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{deMarca.length ? peso(ncMarca) : '—'}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${pendMarca > 0 ? 'text-amber-600 font-semibold' : ''}`}>
                    {deMarca.length ? (pendMarca > 0 ? peso(pendMarca) : '✓') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-2">Detalle por acción</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Marca / Proveedor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Vigencia (acción)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Modelos</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Unidades</th>
              <th className="text-right px-4 py-3 font-medium text-violet-700 bg-violet-50">NC total</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">NC emitida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map(g => (
              <Fragment key={g.key}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleAbierto(g.key)}>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="text-gray-400 mr-1.5 text-xs">{abiertos.has(g.key) ? '▾' : '▸'}</span>
                    <span className="font-medium text-gray-900">{g.marca}</span>
                    <span className="text-xs text-gray-400 ml-1.5">{g.proveedor}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {g.desde ? fechaCorta(g.desde) : '—'} → {g.hasta ? fechaCorta(g.hasta) : 'sin vto'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {g.campanias.length === 1 ? g.campanias[0].nombreModelo : `${g.campanias.length} modelos`}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{g.unidades}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-violet-800 bg-violet-50/40">{peso(g.ncTotal)}</td>
                  <td className="px-4 py-2.5">
                    {g.enCurso ? (
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold bg-green-50 text-green-700 border-green-200"
                        title="Hay campañas vigentes o por arrancar: el monto sigue creciendo con las ventas"
                      >
                        En curso
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold bg-gray-100 text-gray-500 border-gray-200">
                        Cerrada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <CheckEmitida grupo={g} />
                  </td>
                </tr>
                {abiertos.has(g.key) &&
                  g.campanias.map(c => (
                    <tr key={c.id} className="bg-gray-50/60">
                      <td className="px-4 py-1.5" />
                      <td className="px-4 py-1.5 text-xs text-gray-400">bono {peso(c.monto)}{c.cupo ? ` · cupo ${c.cupo}` : ''}</td>
                      <td className="px-4 py-1.5 text-xs text-gray-600">{c.nombreModelo}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-xs text-gray-600">{c.reconocidas}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-xs text-violet-700 bg-violet-50/30">
                        {peso(c.ncTotal)} <span className="text-gray-400">({peso(c.ncUnitaria)}/u)</span>
                      </td>
                      <td className="px-4 py-1.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${ESTADO_CAMPANIA[c.estado].cls}`}>
                          {ESTADO_CAMPANIA[c.estado].label}
                        </span>
                      </td>
                      <td className="px-4 py-1.5" />
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Una NC = una marca + una vigencia: los bonos de la misma acción comercial (ej. los 6 Motorola del 3/9)
        vienen juntos en una única nota de crédito del proveedor de la marca. El filtro de mes muestra las
        acciones cuya vigencia toca ese mes. NC emitida = la marca ya la emitió, no hay que reclamarla; las NC
        en curso siguen sumando con cada venta.
      </p>
    </div>
  )
}
