export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { formatearMoneda } from '@/lib/utils'
import { fetchInventarioResumen } from '@/lib/actions/inventario-resumen'
import {
  velocidadVenta,
  diasCobertura,
  rotacionMensual,
  mesesDeStock,
  ventasPorCobertura,
  modelosAComprar,
} from '@/lib/inventario-indicadores'
import InventarioChart from '@/components/inventario/InventarioChart'
import IndicadoresProducto from '@/components/inventario/IndicadoresProducto'

export default async function InventarioPage() {
  const { productos, ventasPorModeloCelulares, sinMovimiento, error } = await fetchInventarioResumen()
  const hoy = new Date().toISOString().slice(0, 10)

  const totalStock = productos.reduce((s, p) => s + p.stock, 0)
  const totalCosto = productos.reduce((s, p) => s + (p.costoReposicion ?? 0), 0)
  const totalVenta = productos.reduce((s, p) => s + (p.valorVenta ?? 0), 0)

  const indicadores = productos.map(p => {
    const vel = velocidadVenta(p.ventasDiarias, hoy)
    return {
      key: p.key,
      label: p.label,
      vel7: vel.diaria7,
      vel30: vel.diaria30,
      cobertura: diasCobertura(p.stock, vel.diaria30),
      rotacion: rotacionMensual(vel.diaria30 * 30, p.stock, p.stockCierreAnterior),
      modelos: p.modelos,
    }
  })
  const meses = mesesDeStock(
    productos.map(p => ({ valorVenta: p.valorVenta ?? p.costoReposicion ?? 0, montoVentas30d: p.montoVentas30d })),
  )
  const capitalInmovilizado = sinMovimiento.reduce((s, m) => s + m.capital, 0)
  const todosLosModelos = productos.flatMap(p => p.modelos)
  const cobVentas = ventasPorCobertura(todosLosModelos)
  const aComprar = modelosAComprar(todosLosModelos)
  const fmtPct = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  const fmtPct1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Inventario</h1>
      <p className="text-sm text-gray-500 mb-6">{totalStock.toLocaleString('es-AR')} unidades — valorizadas en {formatearMoneda(totalVenta)}</p>

      {/* Navegación */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Link
          href="/inventario/stock"
          className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-emerald-600 px-4 py-3 text-white text-center">
            <span className="text-2xl">🏭</span>
          </div>
          <div className="p-4 text-center">
            <p className="text-sm font-semibold text-gray-900">Stock por Deposito</p>
            <p className="text-[10px] text-gray-400 mt-1">SKU y ubicacion por warehouse</p>
          </div>
        </Link>
        <Link
          href="/inventario/gestion"
          className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-gray-700 px-4 py-3 text-white text-center">
            <span className="text-2xl">📋</span>
          </div>
          <div className="p-4 text-center">
            <p className="text-sm font-semibold text-gray-900">Gestión</p>
            <p className="text-[10px] text-gray-400 mt-1">Control de stock y contabilidad</p>
          </div>
        </Link>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-green-600 px-4 py-3 text-white text-center">
            <span className="text-2xl">✅</span>
          </div>
          <div className="p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{cobVentas.pctSaludable !== null ? `${fmtPct.format(cobVentas.pctSaludable)}%` : '—'}</p>
            <p className="text-sm font-semibold text-gray-900">Ventas con Cobertura</p>
            <p className="text-[10px] text-gray-400 mt-1">venta 30d con más de 20 días de stock</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-red-600 px-4 py-3 text-white text-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <div className="p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{cobVentas.pctRiesgo !== null ? `${fmtPct.format(cobVentas.pctRiesgo)}%` : '—'}</p>
            <p className="text-sm font-semibold text-gray-900">Ventas en Riesgo</p>
            <p className="text-[10px] text-gray-400 mt-1">venta 30d con menos de 5 días de stock</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-900 px-4 py-3 text-white text-center">
            <span className="text-2xl">🛒</span>
          </div>
          <div className="p-3">
            <p className="text-sm font-semibold text-gray-900 text-center mb-1.5">Modelos a comprar</p>
            {aComprar.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Sin urgencias</p>
            ) : (
              <ul className="space-y-1">
                {aComprar.map(m => (
                  <li key={m.modelo} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-gray-700 truncate" title={m.modelo}>{m.modelo}</span>
                    <span className="text-red-600 font-semibold shrink-0">{fmtPct1.format(m.pctVentasTotal)}%</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">en riesgo y &gt;4% de la venta total</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          No se pudo consultar GOcelular: {error}
        </div>
      )}

      {!error && (
        <>
          {/* Valorización en tiempo real */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Valorización del stock</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                    <th className="py-2 px-3 font-medium">Producto</th>
                    <th className="py-2 px-3 font-medium text-right">Stock</th>
                    <th className="py-2 px-3 font-medium text-right">Costo de Reposición</th>
                    <th className="py-2 px-3 font-medium text-right">Valor de Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.key} className="border-b border-gray-100">
                      <td className="py-2 px-3 text-gray-900">
                        {p.key === 'kits' ? (
                          <Link href="/inventario/kits-seguridad" className="text-magenta-700 hover:underline">
                            {p.label} →
                          </Link>
                        ) : p.label}
                      </td>
                      <td className="py-2 px-3 text-right font-medium">{p.stock.toLocaleString('es-AR')}</td>
                      <td className="py-2 px-3 text-right">{p.costoReposicion !== null ? formatearMoneda(Math.round(p.costoReposicion)) : '—'}</td>
                      <td className="py-2 px-3 text-right">{p.valorVenta !== null ? formatearMoneda(Math.round(p.valorVenta)) : '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold text-gray-900">
                    <td className="py-2 px-3">Total</td>
                    <td className="py-2 px-3 text-right">{totalStock.toLocaleString('es-AR')}</td>
                    <td className="py-2 px-3 text-right">{formatearMoneda(Math.round(totalCosto))}</td>
                    <td className="py-2 px-3 text-right">{formatearMoneda(Math.round(totalVenta))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Costo de Reposición: stock × costo del proveedor más barato en Compras (última actualización) · Valor de Venta: stock × precio actual de la tienda · Kits a $9.000 por unidad
            </p>
          </div>

          {/* Indicadores de gestión */}
          <IndicadoresProducto meses={meses} filas={indicadores} />

          {/* Stock sin movimiento */}
          {sinMovimiento.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-5 mb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-800">Stock sin movimiento (30 días)</h2>
                <p className="text-sm text-amber-700 font-semibold">{formatearMoneda(Math.round(capitalInmovilizado))} inmovilizados</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                      <th className="py-1.5 px-2 font-medium">Modelo</th>
                      <th className="py-1.5 px-2 font-medium text-right">Unidades</th>
                      <th className="py-1.5 px-2 font-medium text-right">Capital</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinMovimiento.map(m => (
                      <tr key={m.modelo} className="border-b border-gray-100">
                        <td className="py-1.5 px-2 text-gray-900">{m.modelo}</td>
                        <td className="py-1.5 px-2 text-right">{m.qty.toLocaleString('es-AR')}</td>
                        <td className="py-1.5 px-2 text-right">{m.capital > 0 ? formatearMoneda(Math.round(m.capital)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Modelos de celular con stock disponible y cero ventas en los últimos 30 días, valuados al último costo</p>
            </div>
          )}

          {/* Gráfico unificado + existencias mensuales */}
          <InventarioChart
            celulares={ventasPorModeloCelulares}
            productos={productos
              .filter(p => p.key !== 'celulares')
              .map(p => ({
                key: p.key,
                label: p.label,
                ventasDiarias: p.ventasDiarias,
                cierres: p.cierres,
                sinMonto: p.key === 'kits',
              }))}
          />
        </>
      )}
    </div>
  )
}
