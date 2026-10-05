'use client'

// Cola del Botón de Arrepentimiento: pendientes arriba (más viejo primero,
// es una cola), resueltas colapsadas abajo. Acciones en 2 pasos (clic arma,
// segundo clic ejecuta — patrón DemorasTable).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  confirmarArrepentimiento,
  descartarArrepentimiento,
  type SolicitudArrepentimiento,
} from '@/lib/actions/arrepentimientos'
import { MOTIVOS_DESCARTE_ARREPENTIMIENTO } from '@/lib/arrepentimientos'

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Estado de la orden en GOcuotas (refrescado por el cron): "anulada" confirma
// que la gestión de Yamila impactó; "activa" = sigue vigente
function EstadoOrdenChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-300">—</span>
  const esAnulada = status === 'discarded'
  const esActiva = status === 'approved' || status === 'paid' || status === 'collected'
  return (
    <span
      title={`order_status GOcuotas: ${status}`}
      className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border ${
        esAnulada
          ? 'text-rose-700 bg-rose-50 border-rose-200'
          : esActiva
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-gray-600 bg-gray-50 border-gray-200'
      }`}
    >
      {esAnulada ? 'anulada' : esActiva ? 'activa' : status}
    </span>
  )
}

export default function ArrepentimientosTable({ solicitudes }: { solicitudes: SolicitudArrepentimiento[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [armada, setArmada] = useState<{ id: string; accion: 'confirmar' | 'descartar' } | null>(null)
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DESCARTE_ARREPENTIMIENTO[0])
  const [error, setError] = useState<string | null>(null)
  const [verResueltas, setVerResueltas] = useState(false)

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente')
  const resueltas = solicitudes.filter(s => s.estado !== 'pendiente').reverse()
  const confirmadas = resueltas.filter(s => s.estado === 'confirmada').length
  const pendConDespacho = pendientes.filter(s => s.tracking).length
  const pendSinDespacho = pendientes.length - pendConDespacho

  const ejecutar = (s: SolicitudArrepentimiento, accion: 'confirmar' | 'descartar') => {
    if (armada?.id !== s.id || armada.accion !== accion) {
      setArmada({ id: s.id, accion })
      setError(null)
      return
    }
    startTransition(async () => {
      const res =
        accion === 'confirmar'
          ? await confirmarArrepentimiento(s.id)
          : await descartarArrepentimiento(s.id, motivo)
      if (res.error) setError(res.error)
      else {
        setArmada(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total arrepentimientos</p>
          <p className="text-2xl font-bold text-gray-900">{solicitudes.length}</p>
          <p className="text-xs text-gray-400">desde el inicio de la ingesta</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Resueltas</p>
          <p className="text-2xl font-bold text-gray-900">{resueltas.length}</p>
          <p className="text-xs text-gray-400">
            {confirmadas} confirmadas · {resueltas.length - confirmadas} descartadas
          </p>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Pendientes con despacho</p>
          <p className="text-2xl font-bold text-blue-700">{pendConDespacho}</p>
          <p className="text-xs text-gray-400">candidatas a rescate Andreani</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Pendientes sin despachar</p>
          <p className="text-2xl font-bold text-amber-600">{pendSinDespacho}</p>
          <p className="text-xs text-gray-400">anular la orden y descartar</p>
        </div>
      </div>
      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-4 pt-4">
          <h2 className="text-sm font-semibold text-gray-900">Solicitudes pendientes ({pendientes.length})</h2>
          <p className="text-xs text-gray-400 mb-2">
            Mails del Botón de Arrepentimiento, cargados automáticamente cada 30 min. Confirmar crea el
            rescate (pestaña Rescates); si no hay despacho, anulá la orden en GOcuotas y descartá.
          </p>
        </div>
        {pendientes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin solicitudes pendientes 🎉</p>
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="text-left px-4 py-3">Solicitud</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Pedido · Order ID</th>
                <th className="text-left px-4 py-3" title="Estado de la orden en GOcuotas, refrescado cada 30 min">Orden GOcuotas</th>
                <th className="text-left px-4 py-3">Producto</th>
                <th className="text-left px-4 py-3">Envío</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendientes.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs">
                    {fechaCorta(s.emailFecha)}
                    {s.insistencias > 1 && (
                      <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                        insistió ×{s.insistencias}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{s.nombre}</span>
                    <span className="text-gray-400 text-xs ml-1.5">DNI {s.dni}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {s.orderNumber ? (
                      <>
                        {s.orderNumber}
                        {s.gocuotasOrderId && <span className="text-gray-500"> · {s.gocuotasOrderId}</span>}
                        {s.otrasOrdenes > 0 && (
                          <span className="ml-1.5 font-sans text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                            ⚠ +{s.otrasOrdenes} órdenes
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-sans text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1">
                        sin orden encontrada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><EstadoOrdenChip status={s.gocuotasStatus} /></td>
                  <td className="px-4 py-2.5 text-xs">{s.producto ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {s.tracking ? (
                      <a
                        href={`https://www.andreani.com/envio/${s.tracking}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline font-mono"
                      >
                        {s.tracking}
                      </a>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                        sin despachar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => ejecutar(s, 'confirmar')}
                      disabled={!s.tracking || isPending}
                      title={s.tracking ? 'Crear el rescate en Andreani (pestaña Rescates)' : 'Sin despacho: anular la orden y descartar'}
                      className={`text-xs font-medium rounded-lg px-2.5 py-1 mr-1.5 transition-colors ${
                        armada?.id === s.id && armada.accion === 'confirmar'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40'
                      }`}
                    >
                      {armada?.id === s.id && armada.accion === 'confirmar' ? '¿Confirmar rescate?' : 'Confirmar'}
                    </button>
                    {armada?.id === s.id && armada.accion === 'descartar' && (
                      <select
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 mr-1.5"
                      >
                        {MOTIVOS_DESCARTE_ARREPENTIMIENTO.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => ejecutar(s, 'descartar')}
                      disabled={isPending}
                      className={`text-xs font-medium rounded-lg px-2.5 py-1 transition-colors ${
                        armada?.id === s.id && armada.accion === 'descartar'
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {armada?.id === s.id && armada.accion === 'descartar' ? '¿Descartar?' : 'Descartar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={() => setVerResueltas(v => !v)}
          className="w-full text-left px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          {verResueltas ? '▾' : '▸'} Resueltas ({resueltas.length})
        </button>
        {verResueltas && resueltas.length > 0 && (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {resueltas.map(s => (
                <tr key={s.id} className="text-gray-500">
                  <td className="px-4 py-2 text-xs">{fechaCorta(s.emailFecha)}</td>
                  <td className="px-4 py-2 text-xs">{s.nombre} · DNI {s.dni}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.orderNumber ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    {s.estado === 'confirmada' ? (
                      <span className="text-emerald-700">✓ rescate confirmado</span>
                    ) : (
                      <span>descartada — {s.descarteMotivo}</span>
                    )}
                    {s.resueltoAt && <span className="text-gray-400"> · {fechaCorta(s.resueltoAt)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
