'use client'

import { Fragment } from 'react'
import type { AlertaEnvio } from '@/lib/gocelular'

function fecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-AR') : '—'
}

function Dias({ dias }: { dias: number }) {
  const cls = dias >= 7 ? 'bg-red-50 text-red-700 border-red-200'
    : dias >= 3 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium tabular-nums ${cls}`}>
      {dias} {dias === 1 ? 'día' : 'días'}
    </span>
  )
}

function Tabla({ alertas, conRazon, etiquetaNota = 'Razón' }: { alertas: AlertaEnvio[]; conRazon: boolean; etiquetaNota?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Orden</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Destino</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Pago</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Expedido</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Orden WH</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Tracking</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Envío</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">Pendiente</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {alertas.map((a) => (
            <Fragment key={a.orderNumber}>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{a.orderNumber}</td>
                <td className="px-4 py-3 text-gray-900">
                  {a.cliente || '—'}
                  <div className="text-xs text-gray-500">
                    {[a.dni && `DNI ${a.dni}`, a.telefono].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={a.producto ?? undefined}>{a.producto ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{a.destino || '—'}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(a.paidAt)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(a.sentAt)}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.ordenWh ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{a.tracking ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {a.shipmentStatus ?? '—'}
                  {a.admittedAt && <div className="text-xs text-gray-400">admitido {fecha(a.admittedAt)}</div>}
                </td>
                <td className="px-4 py-3 text-right"><Dias dias={a.diasPendiente} /></td>
              </tr>
              {conRazon && a.razon && (
                <tr>
                  <td colSpan={10} className="px-4 pb-3 pt-0">
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="font-semibold">{etiquetaNota}:</span> {a.razon}
                    </div>
                  </td>
                </tr>
              )}
              {a.shipmentError && (
                <tr>
                  <td colSpan={10} className="px-4 pb-3 pt-0">
                    <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <span className="font-semibold">Error del envío:</span> {a.shipmentError}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AlertasTable({
  requierenAtencion,
  expedidosSinImei,
}: {
  requierenAtencion: AlertaEnvio[]
  expedidosSinImei: AlertaEnvio[]
}) {
  if (requierenAtencion.length === 0 && expedidosSinImei.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <p className="text-sm text-green-700 font-medium">✅ Sin alertas: no hay pedidos que requieran atención ni expedidos sin IMEI.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {requierenAtencion.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            ⚠️ Requieren atención ({requierenAtencion.length})
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            El warehouse de Andreani marcó estos pedidos con un problema — la razón figura debajo de cada fila.
          </p>
          <Tabla alertas={requierenAtencion} conRazon />
        </div>
      )}

      {expedidosSinImei.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            🚨 Expedidos sin IMEI ({expedidosSinImei.length})
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Andreani despachó estos pedidos pero no hay ningún equipo vinculado a la orden (ni en el envío ni en el
            inventario): el stock queda inflado en una unidad por cada uno hasta asignar el IMEI. La nota histórica
            bajo la fila (si hay) refiere a problemas anteriores del pedido, no al estado actual.
          </p>
          <Tabla alertas={expedidosSinImei} conRazon etiquetaNota="Nota histórica del pedido" />
        </div>
      )}
    </div>
  )
}
