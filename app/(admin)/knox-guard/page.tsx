export const dynamic = 'force-dynamic'

import { formatearMoneda } from '@/lib/utils'
import { fetchKnoxGuardDevices } from '@/lib/gocelular'

export default async function KnoxGuardPage() {
  const devices = await fetchKnoxGuardDevices()

  const totalMonto = devices.reduce((s, d) => s + d.monto_adeudado, 0)
  const totalCuotas = devices.reduce((s, d) => s + d.cuotas_vencidas, 0)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Knox Guard</h1>
      <p className="text-sm text-gray-500 mb-6">Dispositivos sin Trustonic con cuotas vencidas (&gt;3 días de atraso). Desaparecen al regularizar el pago.</p>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Dispositivos a bloquear</p>
          <p className="text-2xl font-bold text-red-700">{devices.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Cuotas vencidas</p>
          <p className="text-2xl font-bold text-gray-900">{totalCuotas}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Monto adeudado</p>
          <p className="text-2xl font-bold text-red-700">{formatearMoneda(totalMonto)}</p>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-12 text-center">
          <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-green-700 font-semibold">Sin dispositivos para bloquear</p>
          <p className="text-green-600 text-sm mt-1">Todos los dispositivos sin Trustonic están al día con sus pagos.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">IMEI</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">DNI</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tienda</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Cuotas</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Adeudado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Días atraso</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {devices.map(d => (
                <tr key={d.imei} className="hover:bg-red-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                  <td className="px-4 py-3 text-gray-900">{d.brand} {d.model}</td>
                  <td className="px-4 py-3 text-gray-700">{d.user_name}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{d.user_dni}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{d.store_name}</td>
                  <td className="px-4 py-3 text-center font-bold text-red-700">{d.cuotas_vencidas}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-700">{formatearMoneda(d.monto_adeudado)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      d.max_dias_atraso > 30 ? 'bg-red-100 text-red-700' :
                      d.max_dias_atraso > 15 ? 'bg-orange-100 text-orange-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {d.max_dias_atraso}d
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full bg-red-600 text-white">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      BLOQUEAR
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
