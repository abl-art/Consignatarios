'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { marcarRegresoRecibido, type FilaRegreso } from '@/lib/actions/envios-regreso'

// Andreani manda fechas en hora argentina sin marcador de zona
const aMs = (f: string) => new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(f) ? f : `${f}-03:00`).getTime()

function fechaCorta(f: string | null): string {
  if (!f) return '—'
  const d = new Date(aMs(f))
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: '2-digit' })
}

function diasDesde(f: string | null): number | null {
  if (!f) return null
  return Math.floor((Date.now() - aMs(f)) / (24 * 3600 * 1000))
}

function BotonRecibido({ tracking, recibido }: { tracking: string; recibido: boolean }) {
  const router = useRouter()
  const [guardando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = () => {
    setError(null)
    startTransition(async () => {
      const r = await marcarRegresoRecibido(tracking, !recibido)
      if (r?.error) setError(r.error)
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={toggle}
        disabled={guardando}
        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
          recibido
            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
        title={recibido ? 'Volver a pendiente (se marcó por error)' : 'El equipo volvió físicamente'}
      >
        {guardando ? 'Guardando…' : recibido ? 'Deshacer' : '✓ Recibido'}
      </button>
      {error && <span className="text-xs text-red-600" title={error}>⚠</span>}
    </span>
  )
}

function Tabla({ filas, esHistorial }: { filas: FilaRegreso[]; esHistorial?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Orden</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Estado Andreani</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Último evento</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Tracking</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">{esHistorial ? 'Recibido' : ''}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map(f => {
            const dias = diasDesde(f.fechaUltimoEvento)
            return (
              <tr key={f.tracking} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{f.orderNumber ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-700">
                  {f.cliente ?? '—'}
                  {f.dni && <span className="block text-xs text-gray-400">DNI {f.dni}</span>}
                  {(f.ciudad || f.provincia) && (
                    <span className="block text-xs text-gray-400">{[f.ciudad, f.provincia].filter(Boolean).join(', ')}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-700">
                  {f.producto ?? '—'}
                  {f.imei && <span className="block text-xs text-gray-400 font-mono">{f.imei}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-700 border-amber-300">
                    {f.estadoAndreani ?? 'No entregado'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                  {fechaCorta(f.fechaUltimoEvento)}
                  {dias !== null && <span className="text-xs text-gray-400"> · hace {dias}d</span>}
                </td>
                <td className="px-4 py-2.5">
                  <a
                    href={`https://www.andreani.com/envio/${f.tracking}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-blue-600 hover:underline"
                  >
                    {f.tracking}
                  </a>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {f.regresoAuto ? (
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold bg-green-50 text-green-700 border-green-200"
                      title="Detectado automáticamente: el IMEI se re-vendió en otro envío o volvió como disponible al inventario"
                    >
                      volvió al stock ✓
                    </span>
                  ) : (
                    <>
                      {esHistorial && f.recibidoAt && (
                        <span className="text-xs text-green-700 mr-2">{new Date(f.recibidoAt).toLocaleDateString('es-AR')}</span>
                      )}
                      <BotonRecibido tracking={f.tracking} recibido={f.recibidoAt !== null} />
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PendienteRegresoTable({ filas }: { filas: FilaRegreso[] }) {
  const pendientes = filas.filter(f => f.recibidoAt === null && !f.regresoAuto)
  const recibidos = filas
    .filter(f => f.recibidoAt !== null || f.regresoAuto)
    .sort((a, b) => (b.recibidoAt ?? b.fechaUltimoEvento ?? '').localeCompare(a.recibidoAt ?? a.fechaUltimoEvento ?? ''))
  const [verHistorial, setVerHistorial] = useState(false)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Envíos que Andreani marcó <b>no entregados</b> (dos visitas fallidas y sin retiro en sucursal: vuelven por proceso)
        y que no están en ninguna otra pestaña — sin rescate, siniestro, arrepentimiento ni devolución pedida.
        Se detectan con un chequeo diario contra el seguimiento de Andreani. Marcá <b>✓ Recibido</b> cuando el equipo vuelva físicamente.
      </p>

      {pendientes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-400">
          No hay envíos pendientes de regreso 🎉
        </div>
      ) : (
        <Tabla filas={pendientes} />
      )}

      {recibidos.length > 0 && (
        <div>
          <button onClick={() => setVerHistorial(v => !v)} className="text-sm text-gray-500 hover:text-gray-700">
            {verHistorial ? '▾' : '▸'} Resueltos ({recibidos.length}) — recibidos a mano y regresos detectados solos
          </button>
          {verHistorial && <div className="mt-2"><Tabla filas={recibidos} esHistorial /></div>}
        </div>
      )}
    </div>
  )
}
