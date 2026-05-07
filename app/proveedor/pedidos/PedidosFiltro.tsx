'use client'

import React, { useState } from 'react'
import { formatearMoneda } from '@/lib/utils'

interface PedidoItem {
  productoNombre: string
  cantidad: number
  precio: number
}

interface Pedido {
  id: string
  proveedorNombre: string
  proveedorId: string
  fecha: string
  confirmadoAt?: string
  entregadoAt?: string
  ingresoStockAt?: string
  items: PedidoItem[]
}

export default function PedidosFiltro({ pedidos }: { pedidos: Pedido[] }) {
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  const proveedores = [...new Set(pedidos.map(p => JSON.stringify({ id: p.proveedorId, nombre: p.proveedorNombre })))].map(j => JSON.parse(j))

  const filtrados = pedidos.filter(p => {
    if (filtroProveedor && p.proveedorId !== filtroProveedor) return false
    if (filtroFecha) {
      const fechaPedido = p.confirmadoAt ? p.confirmadoAt.slice(0, 10) : ''
      const fechaEntrega = p.entregadoAt ? p.entregadoAt.slice(0, 10) : ''
      if (fechaPedido !== filtroFecha && fechaEntrega !== filtroFecha) return false
    }
    return true
  })

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filtroProveedor}
          onChange={e => setFiltroProveedor(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <input
          type="date"
          value={filtroFecha}
          onChange={e => setFiltroFecha(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        {(filtroProveedor || filtroFecha) && (
          <button onClick={() => { setFiltroProveedor(''); setFiltroFecha('') }}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700">
            Limpiar filtros
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          No hay pedidos que coincidan con los filtros.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Proveedor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha pedido</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Unidades</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total c/IVA</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Entrega</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Demora</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Stock</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const totalNeto = p.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
                const totalConIva = totalNeto * 1.21
                const totalUnidades = p.items.reduce((s, i) => s + i.cantidad, 0)

                let demora = ''
                if (p.entregadoAt && p.confirmadoAt) {
                  const dias = Math.round((new Date(p.entregadoAt).getTime() - new Date(p.confirmadoAt).getTime()) / (1000 * 60 * 60 * 24))
                  demora = `${dias} día${dias !== 1 ? 's' : ''}`
                } else if (p.confirmadoAt) {
                  const dias = Math.round((Date.now() - new Date(p.confirmadoAt).getTime()) / (1000 * 60 * 60 * 24))
                  demora = `${dias}d en tránsito`
                }

                return (
                  <React.Fragment key={p.id}>
                  <tr onClick={() => setExpandido(prev => prev === p.id ? null : p.id)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${p.entregadoAt ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <span className="mr-1 text-gray-400">{expandido === p.id ? '▾' : '▸'}</span>
                      {p.proveedorNombre}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{p.fecha}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{totalUnidades} u.</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatearMoneda(totalConIva)}</td>
                    <td className="px-4 py-3 text-center">
                      {p.entregadoAt ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          Recibido
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">En tránsito</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {p.entregadoAt ? (
                        <span className="text-green-700">{new Date(p.entregadoAt).toLocaleDateString('es-AR')}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">{demora}</td>
                    <td className="px-4 py-3 text-center">
                      {p.ingresoStockAt ? (
                        <div className="flex flex-col items-center">
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          <span className="text-[10px] text-gray-400">{new Date(p.ingresoStockAt).toLocaleDateString('es-AR')}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                  {expandido === p.id && (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-1.5 font-medium text-gray-500">Producto</th>
                              <th className="text-center py-1.5 font-medium text-gray-500">Cant.</th>
                              <th className="text-right py-1.5 font-medium text-gray-500">Precio unit.</th>
                              <th className="text-right py-1.5 font-medium text-gray-500">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.items.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                <td className="py-1.5 text-gray-800">{item.productoNombre}</td>
                                <td className="py-1.5 text-center text-gray-600">{item.cantidad}</td>
                                <td className="py-1.5 text-right text-gray-600">{formatearMoneda(item.precio)}</td>
                                <td className="py-1.5 text-right font-medium text-gray-800">{formatearMoneda(item.precio * item.cantidad)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr><td colSpan={3} className="pt-2 text-right text-gray-500">Neto:</td><td className="pt-2 text-right text-gray-700">{formatearMoneda(totalNeto)}</td></tr>
                            <tr><td colSpan={3} className="text-right text-gray-400">IVA 21%:</td><td className="text-right text-gray-400">{formatearMoneda(totalNeto * 0.21)}</td></tr>
                            <tr><td colSpan={3} className="text-right font-bold text-blue-700">Total:</td><td className="text-right font-bold text-blue-700">{formatearMoneda(totalNeto * 1.21)}</td></tr>
                          </tfoot>
                        </table>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
