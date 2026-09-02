'use client'

import type { Siniestro } from '@/lib/gocelular'

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

function CasoChip({ cerradoAt }: { cerradoAt: string | null }) {
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

export default function SiniestrosTable({ siniestros }: { siniestros: Siniestro[] }) {
  if (siniestros.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <p className="text-sm text-green-700 font-medium">✅ Sin siniestros: Andreani no declaró ningún envío extraviado.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Envíos que Andreani declaró siniestrados/extraviados en el tracking. Son equipos perdidos por el correo:
        reclamar la indemnización a Andreani y verificar el bloqueo del equipo por IMEI.
        {' '}«Entregado antes» marca los casos donde Andreani había registrado la entrega y después lo declaró extraviado.
      </p>

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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Orden GOcuotas</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Siniestrado</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Entregado antes</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Caso</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600" title="Días desde que Andreani lo declaró siniestrado">Días</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {siniestros.map((s) => (
              <tr key={s.orderNumber} className="hover:bg-gray-50">
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
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(s.siniestroAt)}</td>
                <td className="px-4 py-3 text-center">{s.entregadoAntes ? '⚠️ Sí' : 'No'}</td>
                <td className="px-4 py-3"><CasoChip cerradoAt={s.cerradoAt} /></td>
                <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{s.dias}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
