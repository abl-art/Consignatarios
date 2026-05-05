export const dynamic = 'force-dynamic'

import { getInventarioByCategoria } from '@/lib/actions/compras'
import { formatearMoneda } from '@/lib/utils'

export default async function KitsSeguridadPage() {
  const items = await getInventarioByCategoria('Kits de Seguridad')

  const totalCompras = items.reduce((s, r) => s + r.compras, 0)
  const totalVentas = items.reduce((s, r) => s + r.ventas, 0)
  const totalDisponible = items.reduce((s, r) => s + r.disponible, 0)
  const totalValuacion = items.reduce((s, r) => s + r.valuacion, 0)
  const totalStockCel = items.reduce((s, r) => s + r.stockCelulares, 0)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Kits de Seguridad</h1>
      <p className="text-sm text-gray-500 mb-6">Inventario de kits recibidos vs ventas realizadas</p>

      {/* Resumen */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex flex-wrap gap-6 text-sm">
        <div>
          <p className="text-xs text-gray-500">Modelos</p>
          <p className="font-bold text-gray-900">{items.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Compras</p>
          <p className="font-bold text-blue-700">{totalCompras}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Ventas</p>
          <p className="font-bold text-amber-700">{totalVentas}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Kits disponibles</p>
          <p className={`font-bold ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Stock celulares</p>
          <p className="font-bold text-purple-700">{totalStockCel}</p>
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
                <th className="text-right px-4 py-3 font-medium text-green-700 bg-green-50">Disponible</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-right px-4 py-3 font-medium text-purple-700 bg-purple-50">Stock cel.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Compras</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ventas</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Precio unit.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Valuación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((r) => {
                const faltanKits = r.stockCelulares > r.disponible
                return (
                  <tr key={r.modelo} className={`hover:bg-gray-50 ${r.disponible < 0 ? 'bg-red-50' : faltanKits ? 'bg-amber-50' : ''}`}>
                    <td className={`px-4 py-3 text-right font-bold bg-green-50/50 ${r.disponible < 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {r.disponible}
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">{r.modelo}</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-700 bg-purple-50/50">
                      {r.stockCelulares}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{r.compras}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{r.ventas}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatearMoneda(r.precioUnitario)}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-medium">
                      {r.valuacion > 0 ? formatearMoneda(r.valuacion) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-semibold">
                <td className={`px-4 py-3 text-right bg-green-50/50 ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</td>
                <td className="px-5 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-purple-700 bg-purple-50/50">{totalStockCel}</td>
                <td className="px-4 py-3 text-right text-blue-700">{totalCompras}</td>
                <td className="px-4 py-3 text-right text-amber-700">{totalVentas}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-right text-green-700">{formatearMoneda(totalValuacion)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        * &quot;Stock cel.&quot; muestra celulares disponibles en inventario GOcelular para cada modelo.
        Si el stock de celulares supera los kits disponibles, aparece REPONER.
      </p>
    </div>
  )
}
