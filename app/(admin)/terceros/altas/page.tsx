import { formatearMoneda } from '@/lib/utils'
import { fetchTercerosAltas } from '@/lib/actions/crm-terceros'
import Link from 'next/link'

export default async function AltasPage() {
  const terceros = await fetchTercerosAltas()

  const totalTiendas = terceros.reduce((s, t) => s + t.tiendas, 0)
  const totalVentas = terceros.reduce((s, t) => s + t.ventasCantidad, 0)
  const totalMonto = terceros.reduce((s, t) => s + t.ventasMonto, 0)
  const totalAyerVentas = terceros.reduce((s, t) => s + t.ventasAyerCantidad, 0)
  const totalAyerMonto = terceros.reduce((s, t) => s + t.ventasAyerMonto, 0)

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/terceros" className="text-gray-400 hover:text-gray-600 text-sm">← Terceros</Link>
        <span className="text-gray-300 text-sm">/</span>
        <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">← Canales</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Altas - Terceros Activos</h1>
      <p className="text-sm text-gray-500 mb-6">Merchants dados de alta en GOcelular</p>

      {terceros.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No hay terceros activos.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Merchant</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Client ID</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Tiendas</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Ventas ayer</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Monto ayer</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Ventas (30d)</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Monto (30d)</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {terceros.map(t => (
                <tr key={t.clientId} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-semibold text-gray-900">{t.merchantName}</td>
                  <td className="px-5 py-3 text-gray-500">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{t.clientId}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">{t.tiendas}</td>
                  <td className="px-5 py-3 text-right font-semibold text-orange-600">{t.ventasAyerCantidad}</td>
                  <td className="px-5 py-3 text-right font-semibold text-orange-700">{formatearMoneda(t.ventasAyerMonto)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-blue-600">{t.ventasCantidad}</td>
                  <td className="px-5 py-3 text-right font-semibold text-green-700">{formatearMoneda(t.ventasMonto)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/dashboard/terceros?merchant=${t.merchantName}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Ver dashboard →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td className="px-5 py-3 text-gray-900">TOTAL</td>
                <td className="px-5 py-3"></td>
                <td className="px-5 py-3 text-right text-gray-900">{totalTiendas}</td>
                <td className="px-5 py-3 text-right text-orange-600">{totalAyerVentas}</td>
                <td className="px-5 py-3 text-right text-orange-700">{formatearMoneda(totalAyerMonto)}</td>
                <td className="px-5 py-3 text-right text-blue-600">{totalVentas}</td>
                <td className="px-5 py-3 text-right text-green-700">{formatearMoneda(totalMonto)}</td>
                <td className="px-5 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
