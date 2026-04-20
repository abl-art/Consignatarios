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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/inventario/celulares" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Celulares
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Pedidos en tránsito</h1>
      </div>

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
