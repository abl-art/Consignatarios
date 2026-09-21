export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import Link from 'next/link'
import { getProveedoresNS } from '@/lib/actions/netsuite'
import ProveedoresNSTable from './ProveedoresNSTable'

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default async function CtaCteNSPage({ searchParams }: { searchParams: { desde?: string; hasta?: string } }) {
  const { proveedores, error } = await getProveedoresNS(searchParams.desde, searchParams.hasta)

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

          <ProveedoresNSTable proveedores={proveedores} desde={searchParams.desde ?? ''} hasta={searchParams.hasta ?? ''} />
          <p className="text-xs text-gray-400 mt-3">Fuente: NetSuite → Databricks (prd.gold_dw). Los datos se actualizan a diario.</p>
        </>
      )}
    </div>
  )
}
