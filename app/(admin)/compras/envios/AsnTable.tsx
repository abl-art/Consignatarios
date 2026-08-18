'use client'

import { useState, Fragment } from 'react'
import type { AsnResumen } from '@/lib/gocelular'

const ESTADOS: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'Aceptado', cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rechazado', cls: 'bg-red-50 text-red-700 border-red-200' },
  sending: { label: 'Enviando', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}

export default function AsnTable({ asns }: { asns: AsnResumen[] }) {
  const [abierto, setAbierto] = useState<string | null>(null)

  if (asns.length === 0) {
    return <p className="text-sm text-gray-500">No hay ASN registrados.</p>
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-6 py-3 font-medium text-gray-600">ID transacción</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Orden</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">Ingreso</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {asns.map((asn) => {
            const estado = ESTADOS[asn.estado] ?? { label: asn.estado, cls: 'bg-gray-50 text-gray-600 border-gray-200' }
            const completo = asn.totalUnidades > 0 && asn.pendientes === 0
            const expandido = abierto === asn.id
            return (
              <Fragment key={asn.id}>
                <tr
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setAbierto(expandido ? null : asn.id)}
                >
                  <td className="px-6 py-3 font-medium text-gray-900 tabular-nums">{asn.id_transaccion}</td>
                  <td className="px-6 py-3 text-gray-600 max-w-[220px] truncate" title={asn.orden}>{asn.orden}</td>
                  <td className="px-6 py-3 text-gray-600">{new Date(asn.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${estado.cls}`}>
                      {estado.label}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {asn.totalUnidades === 0 ? (
                      <span className="text-gray-400">sin items</span>
                    ) : (
                      <span className={completo ? 'text-green-700 font-medium' : 'text-red-600 font-semibold'}>
                        {asn.ingresadas.toLocaleString('es-AR')}/{asn.totalUnidades.toLocaleString('es-AR')}
                        {!completo && ` — ${asn.pendientes.toLocaleString('es-AR')} pendientes`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{expandido ? '▲' : '▼'}</td>
                </tr>
                {expandido && (
                  <tr className="bg-gray-50">
                    <td colSpan={6} className="px-6 py-3">
                      {asn.items.length === 0 ? (
                        <p className="text-xs text-gray-500">Sin items vinculados a este ASN.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left py-1 font-medium">Item</th>
                              <th className="text-left py-1 font-medium">Tipo</th>
                              <th className="text-right py-1 font-medium">Cantidad</th>
                              <th className="text-right py-1 font-medium">Ingresadas</th>
                              <th className="text-right py-1 font-medium">Pendientes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {asn.items.map((item, i) => (
                              <tr key={i} className="border-t border-gray-200">
                                <td className="py-1.5 text-gray-900">{item.descripcion}</td>
                                <td className="py-1.5 text-gray-500">{item.tipo}</td>
                                <td className="py-1.5 text-right tabular-nums">{item.cantidad.toLocaleString('es-AR')}</td>
                                <td className="py-1.5 text-right tabular-nums text-green-700">{item.ingresadas.toLocaleString('es-AR')}</td>
                                <td className={`py-1.5 text-right tabular-nums ${item.cantidad - item.ingresadas > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                  {(item.cantidad - item.ingresadas).toLocaleString('es-AR')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
