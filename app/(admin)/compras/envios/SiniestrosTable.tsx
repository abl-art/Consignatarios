'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Siniestro } from '@/lib/gocelular'
import { cargarSiniestro, setNotaCredito } from '@/lib/actions/siniestros'

function fecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-AR') : '—'
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

function TrustonicChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400">—</span>
  const s = status.toLowerCase()
  // un equipo perdido debería estar bloqueado: locked es lo deseable
  const cls = s === 'locked' ? 'bg-green-50 text-green-700 border-green-200'
    : s === 'active' || s === 'ready_for_use' ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'
  const emoji = s === 'locked' ? '🔒' : s === 'active' || s === 'ready_for_use' ? '⚠️' : ''
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${cls}`}>
      {emoji && `${emoji} `}{status}
    </span>
  )
}

function CasoChip({ cerradoAt, informado }: { cerradoAt: string | null; informado: boolean }) {
  if (!informado) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-blue-50 text-blue-700 border-blue-200">
        📝 Cargado a mano
      </span>
    )
  }
  return cerradoAt ? (
    <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-gray-50 text-gray-600 border-gray-200">
      🔒 Cerrado {fecha(cerradoAt)}
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200">
      🔎 Abierto
    </span>
  )
}

function CargarSiniestro() {
  const [tracking, setTracking] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const cargar = () => {
    setError(null)
    startTransition(async () => {
      const res = await cargarSiniestro(tracking)
      if (res.error) {
        setError(res.error)
      } else {
        setTracking('')
        router.refresh()
      }
    })
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') cargar() }}
          placeholder="Número de envío Andreani"
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono w-64"
        />
        <button
          onClick={cargar}
          disabled={pending || !tracking.trim()}
          className="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Cargando…' : '+ Cargar siniestro'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}
    </div>
  )
}

function NotaCreditoCheck({ tracking, emitida }: { tracking: string | null; emitida: boolean }) {
  const [checked, setChecked] = useState(emitida)
  const [pending, startTransition] = useTransition()
  if (!tracking) return <span className="text-gray-400">—</span>
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      onChange={(e) => {
        const valor = e.target.checked
        setChecked(valor)
        startTransition(async () => {
          const res = await setNotaCredito(tracking, valor)
          if (res.error) setChecked(!valor)
        })
      }}
      className="w-4 h-4 accent-green-600 cursor-pointer"
      title="Tildar cuando Andreani emitió la nota de crédito"
    />
  )
}

export default function SiniestrosTable({ siniestros }: { siniestros: Siniestro[] }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Envíos perdidos por el correo: los declara Andreani en el tracking (columna «Informado por Andreani»)
        o los cargás a mano por número de envío. Tildá «Nota de crédito» cuando Andreani la emita, y verificá
        el bloqueo Trustonic del equipo.
      </p>

      <CargarSiniestro />

      {siniestros.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-sm text-green-700 font-medium">✅ Sin siniestros: Andreani no declaró ningún envío extraviado ni hay cargas manuales.</p>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600" title="Estado del equipo en Trustonic: un equipo perdido debería estar locked">Trustonic</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Siniestrado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600" title="Andreani declaró el siniestro en el tracking del envío">Informado por Andreani</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600" title="Tildar cuando Andreani emitió la nota de crédito">Nota de crédito</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Caso</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600" title="Días desde el siniestro (o desde la carga manual)">Días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {siniestros.map((s) => (
                <tr key={s.tracking ?? s.orderNumber} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{s.orderNumber}</td>
                  <td className="px-4 py-3 text-gray-900">
                    {s.cliente || '—'}
                    <div className="text-xs text-gray-500">
                      {[s.dni && `DNI ${s.dni}`, s.telefono].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                    <div className="truncate" title={s.producto ?? undefined}>{s.producto ?? '—'}</div>
                    {s.imei && <div className="font-mono text-xs text-gray-400">IMEI {s.imei}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.destino || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.tracking ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.gocuotasOrderId ?? '—'}</td>
                  <td className="px-4 py-3"><OrdenGocuotasChip activa={s.ordenActiva} status={s.gocuotasStatus} /></td>
                  <td className="px-4 py-3"><TrustonicChip status={s.trustonicStatus} /></td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {fecha(s.siniestroAt)}
                    {s.entregadoAntes && <div className="text-xs text-amber-600">⚠️ entregado antes</div>}
                  </td>
                  <td className="px-4 py-3 text-center text-base">{s.informadoAndreani ? '✅' : <span className="text-gray-400 text-sm">—</span>}</td>
                  <td className="px-4 py-3 text-center"><NotaCreditoCheck tracking={s.tracking} emitida={s.notaCredito} /></td>
                  <td className="px-4 py-3"><CasoChip cerradoAt={s.cerradoAt} informado={s.informadoAndreani} /></td>
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{s.dias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
