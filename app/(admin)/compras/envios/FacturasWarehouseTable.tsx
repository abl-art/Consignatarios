'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { eliminarFacturaWarehouse, type FacturaWarehouse } from '@/lib/actions/warehouse-factura'
import { formatearMoneda } from '@/lib/utils'

export default function FacturasWarehouseTable({ facturas }: { facturas: FacturaWarehouse[] }) {
  const [borrando, setBorrando] = useState<string | null>(null)
  const router = useRouter()

  if (facturas.length === 0) return null

  async function borrar(id: string, periodo: string) {
    if (!confirm(`¿Eliminar la factura de warehouse de ${periodo}? Se borra también su detalle (el egreso del flujo queda).`)) return
    setBorrando(id)
    try {
      await eliminarFacturaWarehouse(id)
      router.refresh()
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Período</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha factura</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">Unidades</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">Pedidos fact.</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">Pedidos GOcelular</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">Total facturado</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">OUT de más</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">Conciliados</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">A revisar</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {facturas.map(f => (
            <tr key={f.id} className="hover:bg-gray-50">
              <td className="px-6 py-3 font-medium text-gray-900">{f.periodo}</td>
              <td className="px-6 py-3 text-gray-600">{new Date(f.fecha_factura + 'T00:00:00').toLocaleDateString('es-AR')}</td>
              <td className="px-6 py-3 text-right text-gray-900">{f.unidades_out.toLocaleString('es-AR')}</td>
              <td className="px-6 py-3 text-right text-gray-900">{f.ordenes_out.toLocaleString('es-AR')}</td>
              <td className="px-6 py-3 text-right text-gray-900">{f.pedidos_gocelular !== null ? f.pedidos_gocelular.toLocaleString('es-AR') : '—'}</td>
              <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(f.total_facturado)}</td>
              <td className="px-6 py-3 text-right">
                {f.out_sobrefacturado !== null && Math.abs(f.out_sobrefacturado) > 1 ? (
                  <span className="text-red-600 font-semibold">{formatearMoneda(Math.round(f.out_sobrefacturado))}</span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </td>
              <td className="px-6 py-3 text-right text-green-700 font-medium">{f.out_conciliadas}</td>
              <td className="px-6 py-3 text-right">
                <span className={f.out_revisar > 0 ? 'text-amber-600 font-semibold' : 'text-gray-500'}>{f.out_revisar}</span>
              </td>
              <td className="px-6 py-3 text-right">
                <button
                  onClick={() => borrar(f.id, f.periodo)}
                  disabled={borrando === f.id}
                  className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-50"
                >
                  {borrando === f.id ? 'Borrando…' : 'Borrar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
