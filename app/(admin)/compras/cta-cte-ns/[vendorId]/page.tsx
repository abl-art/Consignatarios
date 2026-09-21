export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import Link from 'next/link'
import { getCtaCteNS } from '@/lib/actions/netsuite'

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtFecha(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const tipoBadge: Record<string, string> = {
  Factura: 'bg-gray-100 text-gray-700',
  Pago: 'bg-emerald-100 text-emerald-700',
  Anticipo: 'bg-blue-100 text-blue-700',
  Otro: 'bg-amber-100 text-amber-700',
}

export default async function CtaCteProveedorPage({ params }: { params: { vendorId: string } }) {
  const { ctaCte, error } = await getCtaCteNS(params.vendorId)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/compras/cta-cte-ns" className="text-sm text-gray-500 hover:text-gray-900">← Cta Cte Prov NS</Link>
        {ctaCte && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{ctaCte.nombre}</h1>
            {ctaCte.cuit && <p className="text-sm text-gray-500">CUIT {ctaCte.cuit}</p>}
          </>
        )}
      </div>

      {error || !ctaCte ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error || 'No se encontró el proveedor'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500">Total comprado</p>
              <p className="text-xl font-bold text-gray-900">{fmtPesos(ctaCte.totalComprado)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500">Total pagado</p>
              <p className="text-xl font-bold text-gray-900">{fmtPesos(ctaCte.totalPagado)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500">Saldo adeudado</p>
              <p className={`text-xl font-bold ${ctaCte.saldo > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtPesos(ctaCte.saldo)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Fecha</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Tipo</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Comprobante</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Debe</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Haber</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {ctaCte.movimientos.map((m, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${tipoBadge[m.tipo]}`}>{m.tipo}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-900">
                      {m.comprobante}
                      {m.detalle && <span className="block text-xs text-gray-400">{m.detalle}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900">{m.debe > 0 ? fmtPesos(m.debe) : ''}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{m.haber > 0 ? fmtPesos(m.haber) : ''}</td>
                    <td className={`px-3 py-2 text-right font-medium ${m.saldo > 0 ? 'text-gray-900' : 'text-emerald-700'}`}>{fmtPesos(m.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Debe = facturas de compra · Haber = pagos y anticipos aplicados · Saldo = acumulado cronológico.
            El saldo adeudado del resumen sale del impago según NetSuite; puede diferir del acumulado si hay pagos sin aplicar.
          </p>
        </>
      )}
    </div>
  )
}
