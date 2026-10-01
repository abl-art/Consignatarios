'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DemoraEntrega, MetodoEntrega } from '@/lib/demoras'
import { resumenDemoras, UMBRAL_DOMICILIO_DIAS, UMBRAL_SUCURSAL_DIAS } from '@/lib/demoras'
import { cargarRescate } from '@/lib/actions/rescates'

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR')
}

// Un clic pide el rescate con motivo "No Entregado": la fila pasa a la pestaña
// Rescates (pendiente de aceptación) y sale de Demoras en el refresh.
function BotonRescate({ tracking }: { tracking: string | null }) {
  const router = useRouter()
  const [enviando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!tracking) return <span className="text-gray-400">—</span>
  return (
    <span className="inline-flex items-center gap-1">
      <button
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            const res = await cargarRescate(tracking, 'No Entregado')
            if (res.error) setError(res.error)
            else router.refresh()
          })
        }
        className="px-2.5 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
        title="Solicitar el rescate con motivo No Entregado — pasa a la pestaña Rescates"
      >
        {enviando ? 'Cargando…' : 'Pedir rescate'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

type Filtro = 'todos' | MetodoEntrega | 'criticos'

export default function DemorasTable({ demoras }: { demoras: DemoraEntrega[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const resumen = useMemo(() => resumenDemoras(demoras), [demoras])
  const visibles = useMemo(() => {
    if (filtro === 'criticos') return demoras.filter(d => d.diasDemora > 21)
    if (filtro === 'todos') return demoras
    return demoras.filter(d => d.metodo === filtro)
  }, [demoras, filtro])

  if (demoras.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-600">
          No hay entregas demoradas: todo lo despachado está dentro de los {UMBRAL_DOMICILIO_DIAS} días
          (domicilio) / {UMBRAL_SUCURSAL_DIAS} días (sucursal) desde la confirmación.
        </p>
      </div>
    )
  }

  const tarjetas: { id: Filtro; label: string; cantidad: number; tono?: string }[] = [
    { id: 'todos', label: '📦 Demorados', cantidad: resumen.total },
    { id: 'domicilio', label: `🏠 Domicilio (>${UMBRAL_DOMICILIO_DIAS}d)`, cantidad: resumen.domicilio },
    { id: 'sucursal', label: `🏤 Sucursal (>${UMBRAL_SUCURSAL_DIAS}d)`, cantidad: resumen.sucursal },
    { id: 'criticos', label: '🔴 Más de 21 días', cantidad: resumen.criticos, tono: 'text-red-700' },
  ]

  return (
    <div>
      <p className="text-xs text-gray-500 max-w-3xl mb-4">
        Órdenes confirmadas y despachadas que Andreani todavía no marcó como entregadas: domicilio con
        más de {UMBRAL_DOMICILIO_DIAS} días desde la confirmación, sucursal con más de {UMBRAL_SUCURSAL_DIAS}.
        No incluye lo que ya está en Rescates ni en Siniestros. &quot;Pedir rescate&quot; lo carga con
        motivo No Entregado y lo mueve a la pestaña Rescates.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {tarjetas.map(t => {
          const activa = filtro === t.id
          return (
            <button
              key={t.id}
              onClick={() => setFiltro(activa ? 'todos' : t.id)}
              className={`bg-white border rounded-xl p-4 text-left transition-colors ${
                activa ? 'border-magenta-600 ring-1 ring-magenta-600' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-xs text-gray-500 mb-1">{t.label}</div>
              <div className={`text-3xl font-bold tabular-nums ${t.tono ?? 'text-gray-900'}`}>{t.cantidad}</div>
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Orden</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Destino</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Entrega</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Confirmada</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600" title="Días desde la confirmación de la orden">Días</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Último evento Andreani</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tracking</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600" title="Orden GOcuotas: activa (delivered) o anulada (discarded)">Orden GOcuotas</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map(d => (
              <tr key={`${d.orderNumber}-${d.tracking}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{d.orderNumber}</td>
                <td className="px-4 py-3">
                  <div className="text-gray-900">{d.cliente || '—'}</div>
                  <div className="text-xs text-gray-400">
                    {[d.dni, d.telefono].filter(Boolean).join(' · ') || ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">{d.producto ?? '—'}</td>
                <td className="px-4 py-3 text-gray-700">{d.destino || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 border ${
                      d.metodo === 'domicilio'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}
                  >
                    {d.metodo === 'domicilio' ? 'Domicilio' : 'Sucursal'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fecha(d.confirmadaAt)}</td>
                <td className={`px-4 py-3 font-bold tabular-nums ${d.diasDemora > 21 ? 'text-red-700' : 'text-gray-900'}`}>
                  {d.diasDemora}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <div className="max-w-xs truncate" title={d.ultimoEvento}>{d.ultimoEvento}</div>
                  {d.diasSinMovimiento !== null && (
                    <div className={`text-xs ${d.diasSinMovimiento > 5 ? 'text-red-600' : 'text-gray-400'}`}>
                      hace {d.diasSinMovimiento} {d.diasSinMovimiento === 1 ? 'día' : 'días'}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{d.tracking ?? '—'}</td>
                <td className="px-4 py-3">
                  {d.ordenActiva === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <span
                      className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 border ${
                        d.ordenActiva
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      {d.ordenActiva ? 'Activa' : 'Anulada'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <BotonRescate tracking={d.tracking} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
