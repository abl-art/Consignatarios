export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import {
  obtenerAjustesAfiliado,
  obtenerLiquidacionesAfiliado,
  obtenerNombreAfiliado,
} from '@/lib/actions/liquidaciones-afiliados'
import SubirFacturaAfiliado from './SubirFacturaAfiliado'

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  pagada: 'bg-green-100 text-green-700',
  compensada: 'bg-amber-100 text-amber-700',
}

export default async function AfiliadoLiquidacionesPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params

  const nombre = await obtenerNombreAfiliado(slug)
  if (!nombre) notFound()

  const result = await obtenerLiquidacionesAfiliado(slug)
  if ('error' in result) notFound()

  const liqs = result.data
  const ajustes = await obtenerAjustesAfiliado(slug)

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Liquidaciones</h1>
      <p className="text-sm text-gray-500 mb-8">{nombre}</p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {liqs.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            <p className="text-sm">No hay liquidaciones generadas aun.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Mes</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Comisiones</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Ajustes</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">A pagar</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Factura</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liqs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{l.mes}</td>
                  <td className="px-6 py-3 text-right text-gray-700">
                    {formatearMoneda(l.total_comisiones)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {(l.ajustes ?? 0) < 0 || (l.saldo_anterior ?? 0) < 0 ? (
                      <details>
                        <summary className="cursor-pointer text-red-600 font-medium whitespace-nowrap">
                          {formatearMoneda((l.ajustes ?? 0) + (l.saldo_anterior ?? 0))}
                        </summary>
                        <div className="mt-2 text-left text-xs text-gray-600 space-y-1 min-w-[220px]">
                          {ajustes
                            .filter((a) => a.mes_aplicado === l.mes)
                            .map((a) => (
                              <p key={a.id} className="whitespace-nowrap">
                                {a.order_number ?? a.order_id} · {a.producto ?? 'producto s/d'} · orden anulada (liquidada en {a.mes_original}) · <span className="text-red-600">-{formatearMoneda(a.comision)}</span>
                              </p>
                            ))}
                          {(l.saldo_anterior ?? 0) < 0 && (
                            <p>Saldo del mes anterior: <span className="text-red-600">{formatearMoneda(l.saldo_anterior)}</span></p>
                          )}
                        </div>
                      </details>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className={`px-6 py-3 text-right font-bold ${l.monto_a_pagar < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatearMoneda(l.monto_a_pagar)}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        ESTADO_COLORS[l.estado] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {l.estado}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {l.estado === 'pendiente' ? (
                      <SubirFacturaAfiliado
                        liquidacionId={l.id}
                        tieneFactura={!!l.factura_url}
                      />
                    ) : l.factura_url ? (
                      <span className="text-xs text-green-600 font-medium">Factura cargada</span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <a
                      href={`/api/pdf/liquidacion-afiliado/${l.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-magenta-600 hover:text-magenta-800"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
