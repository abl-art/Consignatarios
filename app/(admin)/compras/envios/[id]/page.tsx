import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import { notFound } from 'next/navigation'
import type { FacturaEnvio, FacturaEnvioDetalle } from '@/lib/types'

export default async function FacturaEnvioDetallePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { filtro?: string }
}) {
  const supabase = createClient()

  const { data: factura } = await supabase
    .from('facturas_envios')
    .select('*')
    .eq('id', params.id)
    .single() as { data: FacturaEnvio | null }

  if (!factura) notFound()

  let query = supabase
    .from('facturas_envios_detalle')
    .select('*')
    .eq('factura_id', params.id)
    .order('nro_envio')

  if (searchParams.filtro === 'conciliado' || searchParams.filtro === 'sobrante' || searchParams.filtro === 'ya_pagado') {
    query = query.eq('estado', searchParams.filtro)
  }

  const { data: detalle } = await query.returns<FacturaEnvioDetalle[]>()

  const filtroActual = searchParams.filtro || 'todos'

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/compras/envios" className="text-gray-400 hover:text-gray-600 text-sm">← Control de Envíos</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Factura {factura.nro_legal}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Período: {new Date(factura.fecha_desde).toLocaleDateString('es-AR')} — {new Date(factura.fecha_hasta).toLocaleDateString('es-AR')}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total facturado</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatearMoneda(factura.total_facturado)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Envíos totales</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{factura.total_envios}</p>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-600 uppercase tracking-wide">Conciliados</p>
          <p className="text-xl font-bold text-green-700 mt-1">{factura.envios_conciliados}</p>
        </div>
        <div className={`bg-white border rounded-xl p-4 ${factura.envios_sobrantes > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <p className={`text-xs uppercase tracking-wide ${factura.envios_sobrantes > 0 ? 'text-red-600' : 'text-gray-500'}`}>Sobrantes</p>
          <p className={`text-xl font-bold mt-1 ${factura.envios_sobrantes > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {factura.envios_sobrantes}
          </p>
          {factura.monto_sobrante > 0 && (
            <p className="text-sm text-red-600 font-semibold mt-1">{formatearMoneda(factura.monto_sobrante)}</p>
          )}
        </div>
        {factura.envios_duplicados > 0 && (
          <div className="bg-white border border-orange-200 rounded-xl p-4">
            <p className="text-xs text-orange-600 uppercase tracking-wide">Ya pagados</p>
            <p className="text-xl font-bold text-orange-600 mt-1">{factura.envios_duplicados}</p>
            <p className="text-sm text-orange-600 font-semibold mt-1">{formatearMoneda(factura.monto_duplicado)}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {['todos', 'conciliado', 'sobrante', 'ya_pagado'].map((f) => (
          <Link
            key={f}
            href={`/compras/envios/${params.id}${f === 'todos' ? '' : `?filtro=${f}`}`}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
              filtroActual === f
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'todos' ? 'Todos' : f === 'conciliado' ? 'Conciliados' : f === 'sobrante' ? 'Sobrantes' : 'Ya pagados'}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Nro. Envío</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Concepto</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Destino</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Importe</th>
              <th className="text-center px-6 py-3 font-medium text-gray-600">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {detalle?.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-mono text-gray-900 text-xs">{d.nro_envio}</td>
                <td className="px-6 py-3 text-gray-600">
                  {new Date(d.fecha_envio).toLocaleDateString('es-AR')}
                </td>
                <td className="px-6 py-3 text-gray-600">{d.concepto}</td>
                <td className="px-6 py-3 text-gray-600">
                  {d.localidad_destino}{d.cp_destino ? ` (${d.cp_destino})` : ''}
                </td>
                <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(d.importe)}</td>
                <td className="px-6 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                    d.estado === 'conciliado'
                      ? 'bg-green-100 text-green-700'
                      : d.estado === 'ya_pagado'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {d.estado === 'conciliado' ? 'OK' : d.estado === 'ya_pagado' ? 'Ya pagado' : 'Sobrante'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
