'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Rescate } from '@/lib/gocelular'
import {
  ESTADOS_RESCATE,
  MOTIVOS_RESCATE,
  contarPorEstado,
  filtrarRescatesPorFecha,
  metaEstado,
  pipelineRescates,
  type EstadoRescate,
} from '@/lib/rescates'
import { cargarRescate, setMotivoRescate } from '@/lib/actions/rescates'

const CHIP_POR_ESTADO: Record<EstadoRescate, string> = {
  pendiente: 'bg-violet-50 text-violet-700 border-violet-200',
  solicitado: 'bg-gray-50 text-gray-600 border-gray-200',
  rescatado: 'bg-amber-50 text-amber-700 border-amber-200',
  en_viaje: 'bg-blue-50 text-blue-700 border-blue-200',
  rendido: 'bg-green-50 text-green-700 border-green-200',
  entregado: 'bg-red-50 text-red-700 border-red-200',
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR')
}

function dias(n: number | null): string {
  if (n === null) return 'sin datos'
  return `${n.toLocaleString('es-AR')} ${n === 1 ? 'día' : 'días'}`
}

function NodoPipeline({ estado }: { estado: EstadoRescate }) {
  const meta = metaEstado(estado)
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-2xl leading-none">{meta.emoji}</span>
      <span className="text-xs text-gray-600 mt-1 whitespace-nowrap">{meta.label}</span>
    </div>
  )
}

function Pipeline({ rescates }: { rescates: Rescate[] }) {
  const { tramos, total } = pipelineRescates(rescates)
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 overflow-x-auto">
      <div className="text-xs font-semibold text-gray-900 mb-3">
        Flujo normal del rescate — tiempo promedio entre estados
      </div>
      <div className="flex items-center gap-3 min-w-max">
        <NodoPipeline estado="solicitado" />
        {tramos.map((t) => (
          <Fragment key={t.a}>
            <div className="flex flex-col items-center px-1">
              <span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">{dias(t.promedioDias)}</span>
              <span className="text-gray-300 leading-none">──────▶</span>
              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                {t.muestras} {t.muestras === 1 ? 'envío' : 'envíos'}
              </span>
            </div>
            <NodoPipeline estado={t.a} />
          </Fragment>
        ))}
      </div>
      <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
        🕐 → ✅ Solicitud a rendido: <span className="font-semibold text-gray-900">{dias(total.promedioDias)}</span> en promedio
        {total.muestras > 0 && <span className="text-gray-400"> ({total.muestras} {total.muestras === 1 ? 'rescate completado' : 'rescates completados'})</span>}
        <span className="text-gray-400"> · cada tramo promedia solo los envíos que pasaron por ambos estados</span>
      </div>
    </div>
  )
}

function OrdenGocuotasChip({ activa, status }: { activa: boolean | null; status: string | null }) {
  if (activa === null) return <span className="text-gray-400">—</span>
  const cls = activa ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${cls}`}
      title={status ? `Status GOcuotas: ${status}` : undefined}
    >
      {activa ? '✅ Activa' : '❌ Anulada'}
    </span>
  )
}

function EstadoChip({ estado }: { estado: EstadoRescate }) {
  const meta = metaEstado(estado)
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${CHIP_POR_ESTADO[estado]}`}>
      {meta.emoji} {meta.label}
    </span>
  )
}

function CargarRescate() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [tracking, setTracking] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, startTransition] = useTransition()

  const guardar = () => {
    setError(null)
    startTransition(async () => {
      const r = await cargarRescate(tracking, motivo)
      if (r.error) {
        setError(r.error)
        return
      }
      setTracking('')
      setMotivo('')
      setAbierto(false)
      router.refresh()
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700"
      >
        + Cargar rescate
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={tracking}
        onChange={e => setTracking(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && guardar()}
        placeholder="Nº de seguimiento"
        autoFocus
        className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg font-mono w-44 focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
      <select
        value={motivo}
        onChange={e => setMotivo(e.target.value)}
        className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
      >
        <option value="">Motivo…</option>
        {MOTIVOS_RESCATE.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <button
        onClick={guardar}
        disabled={guardando}
        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-50"
      >
        {guardando ? 'Validando…' : 'Guardar'}
      </button>
      <button onClick={() => { setAbierto(false); setError(null) }} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

function SelectMotivo({ rescate }: { rescate: Rescate }) {
  const router = useRouter()
  const [guardando, startTransition] = useTransition()

  if (!rescate.tracking) return <span className="text-gray-400">—</span>
  const tracking = rescate.tracking

  return (
    <select
      value={rescate.motivo ?? ''}
      disabled={guardando}
      onChange={e =>
        startTransition(async () => {
          await setMotivoRescate(tracking, e.target.value)
          router.refresh()
        })
      }
      className={`px-1.5 py-1 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50 ${
        rescate.motivo ? 'border-gray-300 text-gray-900' : 'border-dashed border-gray-300 text-gray-400'
      }`}
      title="Motivo del rescate"
    >
      <option value="">—</option>
      {MOTIVOS_RESCATE.map(m => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
  )
}

export default function RescatesTable({ rescates }: { rescates: Rescate[] }) {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoRescate | null>(null)

  const porFecha = useMemo(() => filtrarRescatesPorFecha(rescates, desde, hasta), [rescates, desde, hasta])
  const resumen = useMemo(() => contarPorEstado(porFecha), [porFecha])
  const visibles = estadoFiltro ? porFecha.filter(r => r.estado === estadoFiltro) : porFecha

  if (rescates.length === 0) {
    return (
      <div>
        <div className="flex justify-end mb-4"><CargarRescate /></div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-600">No hay envíos con rescate solicitado a Andreani.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <p className="text-xs text-gray-500 max-w-2xl">
          Envíos sin entregar cuyo rescate se pidió a Andreani para que el equipo vuelva al depósito.
          Las tarjetas filtran la tabla al hacer click; el rango de fechas es sobre el día de la solicitud del rescate.
          Un rescate cargado a mano queda 🕓 Pendiente de aceptación hasta que la solicitud aparezca en el tracking;
          de ahí en más el estado avanza solo.
        </p>
        <CargarRescate />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-gray-500">Solicitado entre</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded-md" />
        <span className="text-xs text-gray-500">y</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded-md" />
        {(desde || hasta || estadoFiltro) && (
          <button
            onClick={() => { setDesde(''); setHasta(''); setEstadoFiltro(null) }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {ESTADOS_RESCATE.map(({ estado, emoji, label, descripcion }) => {
          const { cantidad, pct } = resumen.find(r => r.estado === estado)!
          const activa = estadoFiltro === estado
          return (
            <button
              key={estado}
              onClick={() => setEstadoFiltro(activa ? null : estado)}
              title={descripcion}
              className={`bg-white border rounded-xl p-4 text-left transition-colors ${
                activa ? 'border-magenta-600 ring-1 ring-magenta-600' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-xs text-gray-500 mb-1">{emoji} {label}</div>
              <div className="text-3xl font-bold text-gray-900 tabular-nums">{cantidad}</div>
              <div className="text-xs text-gray-400 tabular-nums">{pct}% del total</div>
            </button>
          )
        })}
      </div>

      <Pipeline rescates={porFecha} />

      {visibles.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-600">Ningún rescate coincide con los filtros.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Orden</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Destino</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tracking</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Order ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" title="Orden GOcuotas: activa (delivered) o anulada (discarded)">Orden GOcuotas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Motivo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Solicitado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Último evento</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600" title="Terminados: días de solicitud a resolución. Activos: días corriendo.">Días</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.map((r) => (
                <tr key={r.orderNumber} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{r.orderNumber}</td>
                  <td className="px-4 py-3 text-gray-900">
                    {r.cliente || '—'}
                    <div className="text-xs text-gray-500">
                      {[r.dni && `DNI ${r.dni}`, r.telefono].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={r.producto ?? undefined}>{r.producto ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.destino || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.tracking ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.gocuotasOrderId ?? '—'}</td>
                  <td className="px-4 py-3"><OrdenGocuotasChip activa={r.ordenActiva} status={r.gocuotasStatus} /></td>
                  <td className="px-4 py-3"><SelectMotivo rescate={r} /></td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(r.solicitadoAt)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.ultimoEvento}
                    <div className="text-xs text-gray-400">{fecha(r.ultimoEventoAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{r.dias}</td>
                  <td className="px-4 py-3"><EstadoChip estado={r.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
