export const dynamic = 'force-dynamic'

import { formatearMoneda } from '@/lib/utils'
import { fetchAccesorioData, PARLANTES_CONFIG } from '@/lib/actions/accesorios-ventas'
import AccesoriosVentasChart from '@/components/inventario/AccesoriosVentasChart'
import ExistenciasMensuales from '@/components/inventario/ExistenciasMensuales'

export default async function ParlantesPage() {
  const { kpis, ventasDiarias, cierres, error } = await fetchAccesorioData(PARLANTES_CONFIG)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Parlantes</h1>
      <p className="text-sm text-gray-500 mb-6">
        Stock disponible sincronizado con GOcelulares.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          No se pudo consultar GOcelular: {error}
        </div>
      )}

      {!error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Stock Disponible</p>
              <p className="text-2xl font-bold text-blue-600">{kpis.stockDisponible}</p>
              <p className="text-xs text-gray-400">en GOcelulares</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Venta Mensual</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasMes}</p>
              <p className="text-xs text-gray-400">mes en curso</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Últimos 7 días</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasSemana}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Ventas Ayer</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasAyer}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Valuación Stock</p>
              <p className="text-2xl font-bold text-gray-900">{formatearMoneda(kpis.valuacion)}</p>
              <p className="text-xs text-gray-400">{kpis.stockDisponible} × {formatearMoneda(kpis.precioUnitario)}</p>
            </div>
          </div>

          <div className="mb-6">
            <AccesoriosVentasChart data={ventasDiarias} producto={PARLANTES_CONFIG.nombreUnificado} />
          </div>

          <ExistenciasMensuales cierres={cierres} categoria="parlantes" />
        </>
      )}
    </div>
  )
}
