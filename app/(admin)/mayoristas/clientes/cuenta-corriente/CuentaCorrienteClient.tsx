'use client'

import { useState } from 'react'
import { formatearMoneda } from '@/lib/utils'
import type { ClienteMayorista } from '@/lib/types'

interface ProformaCC {
  id: string
  nro_proforma: number | null
  cliente_mayorista_id: string
  cliente_nombre: string
  total_con_iva: number
  fecha_confirmacion: string
  estado: string
}

interface Props {
  clientes: ClienteMayorista[]
  proformas: ProformaCC[]
}

export default function CuentaCorrienteClient({ clientes, proformas }: Props) {
  const [clienteId, setClienteId] = useState('')

  const proformasCliente = clienteId
    ? proformas.filter(p => p.cliente_mayorista_id === clienteId)
    : []

  // Calcular saldo acumulado (debe - haber)
  // Por ahora solo hay debe (proformas confirmadas), haber viene de pagos (futuro)
  let saldoAcumulado = 0
  const movimientos = proformasCliente
    .sort((a, b) => new Date(a.fecha_confirmacion || 0).getTime() - new Date(b.fecha_confirmacion || 0).getTime())
    .map(p => {
      saldoAcumulado += p.total_con_iva
      return {
        ...p,
        tipo: 'debe' as 'debe' | 'haber',
        monto: p.total_con_iva,
        saldo: saldoAcumulado,
      }
    })

  const clienteSeleccionado = clientes.find(c => c.id === clienteId)

  return (
    <div className="space-y-6">
      {/* Selector de cliente */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 block mb-2">Seleccionar cliente</label>
        <select
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
        >
          <option value="">Seleccionar cliente...</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>{c.nombre_comercial}</option>
          ))}
        </select>
      </div>

      {clienteId && (
        <>
          {/* Info del cliente */}
          {clienteSeleccionado && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-3 flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-500">Cliente:</span>{' '}
                <span className="font-semibold text-gray-900">{clienteSeleccionado.nombre_comercial}</span>
              </div>
              {clienteSeleccionado.cuit && (
                <div>
                  <span className="text-gray-500">CUIT:</span>{' '}
                  <span className="font-mono text-gray-700">{clienteSeleccionado.cuit}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Saldo actual:</span>{' '}
                <span className={`font-bold ${saldoAcumulado > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatearMoneda(saldoAcumulado)}
                </span>
              </div>
            </div>
          )}

          {/* Tabla cuenta corriente */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Concepto</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Debe</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Haber</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No hay movimientos para este cliente
                    </td>
                  </tr>
                ) : (
                  movimientos.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">
                        {m.fecha_confirmacion ? new Date(m.fecha_confirmacion).toLocaleDateString('es-AR') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          Proforma N° {m.nro_proforma || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-600 tabular-nums">
                        {m.tipo === 'debe' ? formatearMoneda(m.monto) : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 tabular-nums">
                        {m.tipo === 'haber' ? formatearMoneda(m.monto) : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        <span className={m.saldo > 0 ? 'text-red-600' : 'text-green-600'}>
                          {formatearMoneda(m.saldo)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {movimientos.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-bold text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 tabular-nums">
                      {formatearMoneda(movimientos.reduce((s, m) => s + (m.tipo === 'debe' ? m.monto : 0), 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-600 tabular-nums">
                      {formatearMoneda(0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      <span className={saldoAcumulado > 0 ? 'text-red-600' : 'text-green-600'}>
                        {formatearMoneda(saldoAcumulado)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}
