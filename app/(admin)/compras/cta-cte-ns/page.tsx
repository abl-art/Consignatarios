export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import Link from 'next/link'
import { getProveedoresNS } from '@/lib/actions/netsuite'

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default async function CtaCteNSPage() {
  const { proveedores, error } = await getProveedoresNS()

  const totalComprado = proveedores.reduce((s, p) => s + p.totalComprado, 0)
  const totalSaldo = proveedores.reduce((s, p) => s + p.saldo, 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link href="/compras" className="text-sm text-gray-500 hover:text-gray-900">← Compras</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Cta Cte Prov NS</h1>
        <p className="text-sm text-gray-500">Cuenta corriente de proveedores de GOcelular según NetSuite (clasificación GO CELULAR)</p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          No se pudo consultar Databricks: {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500">Proveedores</p>
              <p className="text-xl font-bold text-gray-900">{proveedores.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500">Total comprado</p>
              <p className="text-xl font-bold text-gray-900">{fmtPesos(totalComprado)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500">Saldo adeudado</p>
              <p className={`text-xl font-bold ${totalSaldo > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtPesos(totalSaldo)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Proveedor</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Facturas</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Total comprado</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Pagado</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Saldo</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Última factura</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map(p => (
                  <tr key={p.vendorId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/compras/cta-cte-ns/${p.vendorId}`} className="font-medium text-gray-900 hover:underline">
                        {p.nombre}
                      </Link>
                      {p.cuit && <span className="block text-xs text-gray-400">CUIT {p.cuit}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{p.facturas}</td>
                    <td className="px-3 py-2.5 text-right text-gray-900">{fmtPesos(p.totalComprado)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmtPesos(p.totalPagado)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${p.saldo > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmtPesos(p.saldo)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmtFecha(p.ultimaFactura)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">Fuente: NetSuite → Databricks (prd.gold_dw). Los datos se actualizan a diario.</p>
        </>
      )}
    </div>
  )
}
