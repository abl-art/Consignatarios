'use client'

import { useState, useTransition } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { fetchReporteContabilidad, type ReporteContabilidad } from '@/lib/actions/pase-contabilidad'

interface Props {
  periodos: string[]
  reporteInicial: ReporteContabilidad | null
}

function formatPeriodo(p: string): string {
  const [year, month] = p.split('-')
  const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${names[parseInt(month, 10) - 1]} ${year}`
}

export default function PaseContabilidadClient({ periodos, reporteInicial }: Props) {
  const [periodo, setPeriodo] = useState(periodos[0] ?? '')
  const [reporte, setReporte] = useState<ReporteContabilidad | null>(reporteInicial)
  const [pending, startTransition] = useTransition()

  function handleChangePeriodo(p: string) {
    setPeriodo(p)
    startTransition(async () => {
      const r = await fetchReporteContabilidad(p)
      setReporte(r)
    })
  }

  return (
    <>
      {/* Selector de período */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium text-gray-700">Período:</label>
        <select
          value={periodo}
          onChange={e => handleChangePeriodo(e.target.value)}
          disabled={pending}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {periodos.map(p => (
            <option key={p} value={p}>{formatPeriodo(p)}</option>
          ))}
        </select>
        {pending && <span className="text-xs text-gray-400">Cargando...</span>}
      </div>

      {periodos.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No hay períodos con datos de cierre disponibles.
        </div>
      )}

      {reporte && (
        <>
          {/* Advertencia si incompleto */}
          {!reporte.completo && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
              <strong>Reporte incompleto:</strong> faltan datos de alguna categoria. Revisa las notas en la tabla.
            </div>
          )}

          {/* Tabla resumen */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Categoria</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Existencia Final (uds)</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Valuacion</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reporte.lineas.map(l => (
                  <tr key={l.categoria} className={l.estado !== 'ok' ? 'bg-amber-50/50' : 'hover:bg-gray-50'}>
                    <td className="px-6 py-3 font-medium text-gray-900">{l.categoria}</td>
                    <td className="px-6 py-3 text-right text-blue-600 font-bold">
                      {l.stockFinal !== null ? l.stockFinal : '—'}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900 font-semibold">
                      {l.valuacion !== null ? formatearMoneda(l.valuacion) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      {l.estado === 'ok' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          Completo
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700">{l.nota}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td className="px-6 py-3 text-gray-900">TOTAL</td>
                  <td className="px-6 py-3 text-right text-blue-600">{reporte.totalStock}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(reporte.totalValuacion)}</td>
                  <td className="px-6 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Botón PDF */}
          <a
            href={`/api/pdf/pase-contabilidad?periodo=${reporte.periodo}`}
            target="_blank"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              reporte.completo
                ? 'bg-[#E91E7B] text-white hover:bg-[#d11a6e]'
                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descargar PDF
          </a>
          {!reporte.completo && (
            <p className="text-xs text-gray-400 mt-2">El PDF incluira solo las categorias con datos completos.</p>
          )}
        </>
      )}
    </>
  )
}
