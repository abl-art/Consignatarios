import Link from 'next/link'
import { getPedidos } from '@/lib/actions/compras'
import TransitoTable from './TransitoTable'

export default async function EnTransitoPage() {
  const pedidos = await getPedidos()
  const enTransito = pedidos.filter(p => p.estado === 'enviado' && !p.entregadoAt)

  // Build summary: one line per modelo, with breakdown by proveedor
  const byModel: Record<string, { modelo: string; total: number; proveedores: Record<string, number> }> = {}
  enTransito.forEach(p => {
    p.items.forEach(item => {
      if (!byModel[item.productoNombre]) {
        byModel[item.productoNombre] = { modelo: item.productoNombre, total: 0, proveedores: {} }
      }
      byModel[item.productoNombre].total += item.cantidad
      byModel[item.productoNombre].proveedores[p.proveedorNombre] = (byModel[item.productoNombre].proveedores[p.proveedorNombre] || 0) + item.cantidad
    })
  })
  const summary = Object.values(byModel).sort((a, b) => b.total - a.total)
  const totalUnidades = summary.reduce((s, m) => s + m.total, 0)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-1">
        <Link href="/inventario" className="text-gray-400 hover:text-gray-600 text-sm">← Inventario</Link>
        <span className="text-gray-300 text-sm mx-1">/</span>
        <Link href="/inventario/celulares" className="text-gray-400 hover:text-gray-600 text-sm">← Celulares</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Pedidos en tránsito</h1>
      <p className="text-sm text-gray-500 mb-6">Pedidos enviados pendientes de entrega</p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <p className="text-sm text-blue-700 font-medium">{enTransito.length} pedido{enTransito.length !== 1 ? 's' : ''} en tránsito</p>
        <p className="text-2xl font-bold text-blue-800">{totalUnidades} unidades</p>
      </div>

      {summary.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">No hay pedidos en tránsito</p>
        </div>
      ) : (
        <TransitoTable summary={summary} totalUnidades={totalUnidades} />
      )}
    </div>
  )
}
