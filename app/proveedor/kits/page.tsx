export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getInventarioByCategoria, getProductos } from '@/lib/actions/compras'
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'
import { syncKitsGocelular } from '@/lib/actions/sync-kits'
import { getPreciosKitsMil200 } from '@/lib/actions/proveedor-kits'
import { fetchKitsStockAndreani, type KitStockAndreani } from '@/lib/gocelular-kits'
import EntregaForm from './EntregaForm'

const VALID_TOKEN = 'kits2026go'

export default async function ProveedorKitsPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token !== VALID_TOKEN) {
    redirect('/login')
  }

  await syncKitsGocelular()

  let stockAndreani: Record<string, KitStockAndreani> = {}
  try {
    stockAndreani = await fetchKitsStockAndreani()
  } catch {
    // DB de GOcelular no disponible: se muestra la pagina sin stock
  }

  const [items, allProductos, modelosOcultos, preciosMil200] = await Promise.all([
    getInventarioByCategoria('Kits de Seguridad'),
    getProductos(),
    getModelosOcultos(),
    getPreciosKitsMil200(),
  ])

  // Kits sincronizados desde GOcelular (SKU KS-*)
  const kits = (allProductos as { id: string; nombre: string; codigo: string; categoria: string; oculto?: boolean }[])
    .filter(p => p.categoria === 'Kits de Seguridad' && !p.oculto)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const ocultos = new Set(modelosOcultos.map(m => m.toLowerCase()))
  const itemsFiltrados = items.filter(r => !ocultos.has(r.modelo.toLowerCase()))

  const totalCompras = itemsFiltrados.reduce((s, r) => s + r.compras, 0)
  const totalVentas = itemsFiltrados.reduce((s, r) => s + r.ventas, 0)
  const totalDisponible = itemsFiltrados.reduce((s, r) => s + r.disponible, 0)
  const totalAndreani = kits.reduce((s, k) => s + (stockAndreani[k.codigo]?.stockAndreani ?? 0), 0)

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
            <p className="text-xs text-gray-500 mb-1">Stock en Andreani</p>
            <p className="text-2xl font-bold text-purple-700">{totalAndreani}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Kits comprados</p>
            <p className="text-2xl font-bold text-blue-700">{totalCompras}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Kits vendidos</p>
            <p className="text-2xl font-bold text-amber-700">{totalVentas}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Kits disponibles</p>
            <p className={`text-2xl font-bold ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</p>
          </div>
        </div>

        {/* Kits GOcelular con stock en Andreani */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Kits del catálogo GOcelular</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">SKU</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Kit</th>
                <th className="text-right px-4 py-3 font-medium text-purple-700 bg-purple-50">Stock Andreani</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock total GOcelular</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kits.map(k => {
                const st = stockAndreani[k.codigo]
                return (
                  <tr key={k.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{k.codigo}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{k.nombre}</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-700 bg-purple-50/50">
                      {st ? st.stockAndreani : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{st ? st.stockTotal : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-semibold">
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-purple-700 bg-purple-50/50">{totalAndreani}</td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {kits.reduce((s, k) => s + (stockAndreani[k.codigo]?.stockTotal ?? 0), 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Historico de compras/ventas por modelo */}
        {itemsFiltrados.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">Histórico de entregas y ventas</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Modelo</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Compras</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Ventas</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Kits disp.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itemsFiltrados.map((r) => (
                  <tr key={r.modelo} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.modelo}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{r.compras}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{r.ventas}</td>
                    <td className={`px-4 py-3 text-right font-bold ${r.disponible < 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {r.disponible}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr className="font-semibold">
                  <td className="px-5 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right text-blue-700">{totalCompras}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{totalVentas}</td>
                  <td className={`px-4 py-3 text-right ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 mb-6">
          * &quot;Stock Andreani&quot; = kits ingresados al warehouse de Andreani menos los despachados.
          Los kits del catálogo se sincronizan automáticamente desde GOcelular.
        </p>

        {/* Formulario de entrega */}
        <EntregaForm
          token={searchParams.token!}
          productos={kits.map(p => ({ id: p.id, nombre: p.nombre, codigo: p.codigo }))}
          precios={preciosMil200}
        />
      </div>
    </div>
  )
}
