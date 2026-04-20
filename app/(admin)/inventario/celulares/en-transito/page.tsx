import Link from 'next/link'
import { getPedidos } from '@/lib/actions/compras'
import { formatearMoneda } from '@/lib/utils'

export default async function EnTransitoPage() {
  const pedidos = await getPedidos()
  const enTransito = pedidos.filter(p => p.estado === 'enviado' && !p.entregadoAt)

  // Merge all items by modelo (single line per model)
  const byModel: Record<string, { modelo: string; cantidad: number; proveedores: Set<string> }> = {}
  enTransito.forEach(p => {
    p.items.forEach(item => {
      if (!byModel[item.productoNombre]) {
        byModel[item.productoNombre] = { modelo: item.productoNombre, cantidad: 0, proveedores: new Set() }
      }
      byModel[item.productoNombre].cantidad += item.cantidad
      byModel[item.productoNombre].proveedores.add(p.proveedorNombre)
    })
  })
  const summary = Object.values(byModel).sort((a, b) => b.cantidad - a.cantidad)
  const totalUnidades = summary.reduce((s, m) => s + m.cantidad, 0)

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/inventario/celulares" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Celulares
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Pedidos en tránsito</h1>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-700 font-medium">{enTransito.length} pedido{enTransito.length !== 1 ? 's' : ''} en tránsito</p>
            <p className="text-2xl font-bold text-blue-800">{totalUnidades} unidades</p>
          </div>
        </div>
      </div>

      {summary.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">No hay pedidos en tránsito</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Cantidad</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Proveedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.map(m => (
                <tr key={m.modelo} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{m.modelo}</td>
                  <td className="px-5 py-3 text-center font-bold text-blue-700">{m.cantidad}</td>
                  <td className="px-5 py-3 text-gray-600">{Array.from(m.proveedores).join(', ')}</td>
                </tr>
              ))}
              <tr className="bg-blue-50">
                <td className="px-5 py-3 font-bold text-gray-900">Total</td>
                <td className="px-5 py-3 text-center font-bold text-blue-800">{totalUnidades}</td>
                <td className="px-5 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
