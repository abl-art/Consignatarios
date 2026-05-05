export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getInventarioByCategoria } from '@/lib/actions/compras'
import { formatearMoneda } from '@/lib/utils'

const VALID_TOKEN = 'kits2026go'

export default async function ProveedorKitsPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token !== VALID_TOKEN) {
    redirect('/login')
  }

  const items = await getInventarioByCategoria('Kits de Seguridad')

  const totalCompras = items.reduce((s, r) => s + r.compras, 0)
  const totalVentas = items.reduce((s, r) => s + r.ventas, 0)
  const totalDisponible = items.reduce((s, r) => s + r.disponible, 0)
  const totalStockCel = items.reduce((s, r) => s + r.stockCelulares, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">GOcelular — Kits de Seguridad</h1>
            <p className="text-xs text-gray-500">Vista proveedor — actualizado en tiempo real</p>
          </div>
          <div className="text-right text-xs text-gray-400">
            {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        {/* Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Stock celulares</p>
            <p className="text-2xl font-bold text-purple-700">{totalStockCel}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Kits comprados</p>
            <p className="text-2xl font-bold text-blue-700">{totalCompras}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Kits vendidos</p>
            <p className="text-2xl font-bold text-amber-700">{totalVentas}</p>
          </div>
          <div className={`rounded-xl border p-4 ${totalDisponible < totalStockCel ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500 mb-1">Kits disponibles</p>
            <p className={`text-2xl font-bold ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
            Sin kits registrados.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-purple-700 bg-purple-50">Stock cel.</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Modelo</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Compras</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Ventas</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Kits disp.</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((r) => {
                  const diferencia = r.disponible - r.stockCelulares
                  return (
                    <tr key={r.modelo} className={`hover:bg-gray-50 ${diferencia < 0 ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-3 text-right font-bold text-purple-700 bg-purple-50/50">
                        {r.stockCelulares}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-900">{r.modelo}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{r.compras}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{r.ventas}</td>
                      <td className={`px-4 py-3 text-right font-bold ${r.disponible < 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {r.disponible}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${diferencia < 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {diferencia > 0 ? `+${diferencia}` : diferencia}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr className="font-semibold">
                  <td className="px-4 py-3 text-right text-purple-700 bg-purple-50/50">{totalStockCel}</td>
                  <td className="px-5 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right text-blue-700">{totalCompras}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{totalVentas}</td>
                  <td className={`px-4 py-3 text-right ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</td>
                  <td className={`px-4 py-3 text-right ${(totalDisponible - totalStockCel) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {(totalDisponible - totalStockCel) > 0 ? `+${totalDisponible - totalStockCel}` : totalDisponible - totalStockCel}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          * &quot;Stock cel.&quot; = celulares disponibles en inventario. &quot;Diferencia&quot; = kits disponibles menos stock de celulares.
          Si la diferencia es negativa, faltan kits para cubrir el stock de celulares.
        </p>
      </div>
    </div>
  )
}
