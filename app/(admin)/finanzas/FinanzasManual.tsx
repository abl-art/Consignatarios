'use client'

import { useState } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { EliminarButton, EditarAsistenciaButton, EditarEgresoButton } from './FinanzasActions'

interface Asistencia {
  id: string
  fecha: string
  monto: number
}

interface Egreso {
  id: string
  flujo_dia: string
  concepto: string
  medio_de_pago: string
  cuotas: number
  monto: number
}

interface FinanzasManualProps {
  asistencias: Asistencia[]
  egresos: Egreso[]
}

export default function FinanzasManual({ asistencias, egresos }: FinanzasManualProps) {
  const [showAsistencias, setShowAsistencias] = useState(false)
  const [showEgresos, setShowEgresos] = useState(false)

  const formatFecha = (fecha: string) => {
    const d = new Date(fecha + 'T12:00:00')
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }

  return (
    <div className="space-y-6">
      {/* Asistencias */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowAsistencias(!showAsistencias)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="text-sm font-semibold text-gray-900">
            Asistencias cargadas ({asistencias.length})
          </h3>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${showAsistencias ? 'rotate-180' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showAsistencias && (
          <div className="border-t border-gray-200">
            {asistencias.length === 0 ? (
              <p className="text-sm text-gray-400 p-5 text-center">Sin asistencias cargadas.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Fecha
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Monto
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {asistencias.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-gray-700">{formatFecha(a.fecha)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatearMoneda(a.monto)}</td>
                      <td className="px-4 py-2 text-right flex gap-1 justify-end">
                        <EditarAsistenciaButton id={a.id} fecha={a.fecha} monto={a.monto} />
                        <EliminarButton type="asistencia" id={a.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Egresos */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowEgresos(!showEgresos)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="text-sm font-semibold text-gray-900">
            Egresos cargados ({egresos.length})
          </h3>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${showEgresos ? 'rotate-180' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showEgresos && (
          <div className="border-t border-gray-200">
            {egresos.length === 0 ? (
              <p className="text-sm text-gray-400 p-5 text-center">Sin egresos cargados.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Fecha
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Concepto
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Medio
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Cuotas
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Monto
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {egresos.map((eg) => (
                    <tr key={eg.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-gray-700">{formatFecha(eg.flujo_dia)}</td>
                      <td className="px-4 py-2 text-gray-700">{eg.concepto}</td>
                      <td className="px-4 py-2 text-gray-700">{eg.medio_de_pago}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{eg.cuotas}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatearMoneda(eg.monto)}</td>
                      <td className="px-4 py-2 text-right flex gap-1 justify-end">
                        <EditarEgresoButton id={eg.id} flujo_dia={eg.flujo_dia} concepto={eg.concepto} medio_de_pago={eg.medio_de_pago} cuotas={eg.cuotas} monto={eg.monto} />
                        <EliminarButton type="egreso" id={eg.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
