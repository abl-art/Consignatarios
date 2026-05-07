export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPedidos } from '@/lib/actions/compras'
import { formatearMoneda } from '@/lib/utils'
import PedidosFiltro from './PedidosFiltro'

const VALID_TOKEN = 'pedidos2026go'

export default async function ProveedorPedidosPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token !== VALID_TOKEN) {
    redirect('/login')
  }

  const allPedidos = await getPedidos()
  const pedidos = allPedidos
    .filter(p => p.estado === 'enviado')
    .filter(p => {
      const cat = (p as unknown as { categoria?: string }).categoria
      return !cat || cat === 'Celulares'
    })
    .map(p => ({
      id: p.id,
      proveedorNombre: p.proveedorNombre,
      proveedorId: p.proveedorId,
      fecha: p.fecha,
      confirmadoAt: p.confirmadoAt,
      entregadoAt: p.entregadoAt,
      ingresoStockAt: p.ingresoStockAt,
      items: p.items.map(i => ({
        productoNombre: i.productoNombre,
        cantidad: i.cantidad,
        precio: i.precio,
      })),
    }))

  const enTransito = pedidos.filter(p => !p.entregadoAt).length
  const recibidos = pedidos.filter(p => !!p.entregadoAt).length
  const totalUnidades = pedidos.reduce((s, p) => s + p.items.reduce((si, i) => si + i.cantidad, 0), 0)
  const totalInversion = pedidos.reduce((s, p) => s + p.items.reduce((si, i) => si + i.cantidad * i.precio, 0) * 1.21, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">GOcelular — Pedidos Enviados</h1>
            <p className="text-xs text-gray-500">Vista proveedor — actualizado en tiempo real</p>
          </div>
          <div className="text-right text-xs text-gray-400">
            {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Total pedidos</p>
            <p className="text-2xl font-bold text-gray-900">{pedidos.length}</p>
          </div>
          <div className={`rounded-xl border p-4 ${enTransito > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500 mb-1">En tránsito</p>
            <p className="text-2xl font-bold text-blue-700">{enTransito}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Recibidos</p>
            <p className="text-2xl font-bold text-green-700">{recibidos}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Unidades totales</p>
            <p className="text-2xl font-bold text-gray-900">{totalUnidades.toLocaleString('es-AR')}</p>
          </div>
        </div>

        <PedidosFiltro pedidos={pedidos} />
      </div>
    </div>
  )
}
