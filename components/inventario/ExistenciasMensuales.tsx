'use client'

import { formatearMoneda } from '@/lib/utils'
import type { CierreMensual } from '@/lib/actions/accesorios-ventas'

interface Props {
  cierres: CierreMensual[]
  categoria: string
}

function formatPeriodo(periodo: string): string {
  const [year, month] = periodo.split('-')
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`
}

export default function ExistenciasMensuales({ cierres, categoria }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-4">Existencia Final Mensual</h2>

      {cierres.length === 0 ? (
        <p className="text-sm text-gray-500">
          Aún no hay cierres registrados para {categoria}. Se generan automáticamente el último día de cada mes.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Período</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Stock Final</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Precio Unit.</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Valuación</th>
              </tr>
            </thead>
            <tbody>
              {cierres.map((c, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{formatPeriodo(c.periodo)}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-bold">{c.stock_final}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatearMoneda(c.precio_unitario)}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-semibold">{formatearMoneda(c.valuacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
