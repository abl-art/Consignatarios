'use client'

import { useMemo, useState } from 'react'
import type { Rescate } from '@/lib/gocelular'
import {
  ESTADOS_RESCATE,
  contarPorEstado,
  filtrarRescatesPorFecha,
  metaEstado,
  type EstadoRescate,
} from '@/lib/rescates'

const CHIP_POR_ESTADO: Record<EstadoRescate, string> = {
  solicitado: 'bg-gray-50 text-gray-600 border-gray-200',
  rescatado: 'bg-amber-50 text-amber-700 border-amber-200',
  en_viaje: 'bg-blue-50 text-blue-700 border-blue-200',
  rendido: 'bg-green-50 text-green-700 border-green-200',
  entregado: 'bg-red-50 text-red-700 border-red-200',
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR')
}

function EstadoChip({ estado }: { estado: EstadoRescate }) {
  const meta = metaEstado(estado)
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${CHIP_POR_ESTADO[estado]}`}>
      {meta.emoji} {meta.label}
    </span>
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
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-600">No hay envíos con rescate solicitado a Andreani.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Envíos sin entregar cuyo rescate se pidió a Andreani para que el equipo vuelva al depósito.
        Las tarjetas filtran la tabla al hacer click; el rango de fechas es sobre el día de la solicitud del rescate.
      </p>

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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
