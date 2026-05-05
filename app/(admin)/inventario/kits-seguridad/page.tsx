export const dynamic = 'force-dynamic'

import { getInventarioByCategoria } from '@/lib/actions/compras'
import { formatearMoneda } from '@/lib/utils'

export default async function KitsSeguridadPage() {
  const items = await getInventarioByCategoria('Kits de Seguridad')

  const totalCantidad = items.reduce((s, r) => s + r.cantidad, 0)
  const totalValuacion = items.reduce((s, r) => s + r.valuacion, 0)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Kits de Seguridad</h1>
      <p className="text-sm text-gray-500 mb-6">Inventario de kits recibidos de pedidos confirmados</p>

      {/* Resumen */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex flex-wrap gap-6 text-sm">
        <div>
          <p className="text-xs text-gray-500">Modelos</p>
          <p className="font-bold text-gray-900">{items.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total kits</p>
          <p className="font-bold text-blue-700">{totalCantidad}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Valuación</p>
          <p className="font-bold text-green-700">{formatearMoneda(totalValuacion)}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Sin kits recibidos. Los pedidos de &quot;Kits de Seguridad&quot; marcados como recibidos aparecerán aquí.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Cantidad</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Precio unit.</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Valuación</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Proveedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((r) => (
                <tr key={r.modelo} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{r.modelo}</td>
                  <td className="px-6 py-3 text-right font-bold text-blue-700">{r.cantidad}</td>
                  <td className="px-6 py-3 text-right text-gray-600">{formatearMoneda(r.precioUnitario)}</td>
                  <td className="px-6 py-3 text-right text-green-700 font-medium">{formatearMoneda(r.valuacion)}</td>
                  <td className="px-6 py-3 text-gray-700">{r.proveedor}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-semibold">
                <td className="px-6 py-3 text-gray-900">Total</td>
                <td className="px-6 py-3 text-right text-blue-700">{totalCantidad}</td>
                <td className="px-6 py-3"></td>
                <td className="px-6 py-3 text-right text-green-700">{formatearMoneda(totalValuacion)}</td>
                <td className="px-6 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
