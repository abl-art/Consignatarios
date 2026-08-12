export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getProductos, getPedidos } from '@/lib/actions/compras'
import { syncKitsGocelular } from '@/lib/actions/sync-kits'
import { getPreciosKitsMil200 } from '@/lib/actions/proveedor-kits'
import { fetchKitsStockAndreani, type KitStockAndreani } from '@/lib/gocelular-kits'
import EntregaForm from './EntregaForm'

const VALID_TOKEN = 'kits2026go'
const UMBRAL_REPONER = 100

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

  const [allProductos, pedidos, preciosMil200] = await Promise.all([
    getProductos(),
    getPedidos(),
    getPreciosKitsMil200(),
  ])

  // Kits sincronizados desde GOcelular (SKU KS-*)
  const kits = (allProductos as { id: string; nombre: string; codigo: string; categoria: string; oculto?: boolean }[])
    .filter(p => p.categoria === 'Kits de Seguridad' && !p.oculto)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  // Entregas confirmadas pero todavia no recibidas en el WH de Andreani
  const enTransito: Record<string, number> = {}
  for (const p of pedidos) {
    if (p.categoria !== 'Kits de Seguridad') continue
    if (p.estado !== 'enviado' || p.entregadoAt) continue
    for (const item of p.items) {
      enTransito[item.productoCodigo] = (enTransito[item.productoCodigo] ?? 0) + item.cantidad
    }
  }

  const totalAndreani = kits.reduce((s, k) => s + (stockAndreani[k.codigo]?.stockAndreani ?? 0), 0)
  const totalTransito = kits.reduce((s, k) => s + (enTransito[k.codigo] ?? 0), 0)

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
        {/* Kits GOcelular: en transito + stock Andreani */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Kits del catálogo GOcelular</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">SKU</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Kit</th>
                  <th className="text-right px-4 py-3 font-medium text-blue-700 bg-blue-50">En tránsito al WH</th>
                  <th className="text-right px-4 py-3 font-medium text-purple-700 bg-purple-50">Stock Andreani</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {kits.map(k => {
                  const andreani = stockAndreani[k.codigo]?.stockAndreani ?? 0
                  const transito = enTransito[k.codigo] ?? 0
                  const reponer = andreani + transito < UMBRAL_REPONER
                  return (
                    <tr key={k.id} className={`hover:bg-gray-50 ${reponer ? 'bg-red-50/50' : ''}`}>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{k.codigo}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{k.nombre}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700 bg-blue-50/50">
                        {transito > 0 ? transito : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-purple-700 bg-purple-50/50">
                        {andreani}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {reponer ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Reponer
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr className="font-semibold">
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right text-blue-700 bg-blue-50/50">{totalTransito}</td>
                  <td className="px-4 py-3 text-right text-purple-700 bg-purple-50/50">{totalAndreani}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-6">
          * &quot;En tránsito al WH&quot; = entregas confirmadas pendientes de ingreso en Andreani.
          &quot;Stock Andreani&quot; = kits ingresados al warehouse menos los despachados.
          &quot;Reponer&quot; = stock Andreani + en tránsito menor a {UMBRAL_REPONER} unidades.
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
