import { getFacturasWarehouse } from '@/lib/actions/warehouse-factura'
import { getDistribucionMensual } from '@/lib/actions/envios'
import { desgloseWarehouse, BUCKETS_WAREHOUSE } from '@/lib/warehouse-factura'
import { formatearMoneda } from '@/lib/utils'

const formatMes = (mes: string) => {
  const [y, m] = mes.split('-')
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${nombres[parseInt(m) - 1]} ${y}`
}

/**
 * Resumen de costos de Andreani para la solapa Costos: warehouse (IN /
 * Almacenamiento / Preparado OUT / Materiales / Seguro) y distribución
 * (distribución / seguro), con el costo unitario de cada parte y el total
 * por venta. Todos los montos sin IVA, como vienen facturados.
 */
export default async function CostosResumen() {
  const [facturasWh, distribucion] = await Promise.all([
    getFacturasWarehouse(),
    getDistribucionMensual(),
  ])

  const whMeses = [...facturasWh]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map(f => ({
      mes: f.periodo,
      unidades: f.unidades_out,
      pedidos: f.ordenes_out,
      desglose: desgloseWarehouse(f.conceptos),
      total: f.total_facturado,
    }))

  // Costo total por venta: último mes con factura de warehouse + la
  // distribución de ese mismo mes (una venta = una unidad expedida ≈ un envío)
  const whUltimo = whMeses[whMeses.length - 1]
  const distUltimo = whUltimo ? distribucion.find(d => d.mes === whUltimo.mes) : undefined
  const whUnit = whUltimo && whUltimo.unidades > 0 ? whUltimo.total / whUltimo.unidades : null
  const distUnit = distUltimo && distUltimo.envios > 0 ? (distUltimo.distribucion + distUltimo.seguro) / distUltimo.envios : null

  const buckets = BUCKETS_WAREHOUSE.filter(
    b => b.key !== 'otros' || whMeses.some(m => m.desglose.otros > 0),
  )

  return (
    <div className="space-y-6">
      {/* Costo Andreani total por venta */}
      {whUnit !== null && (
        <div className="bg-white border border-magenta-200 rounded-xl p-5">
          <p className="text-xs text-magenta-700 uppercase tracking-wide">Costo Andreani por venta · {formatMes(whUltimo.mes)}</p>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-1">
            <p className="text-3xl font-bold text-magenta-700">
              {distUnit !== null ? formatearMoneda(Math.round(whUnit + distUnit)) : formatearMoneda(Math.round(whUnit))}
            </p>
            <p className="text-sm text-gray-600">
              Warehouse <span className="font-semibold">{formatearMoneda(Math.round(whUnit))}</span>
              {distUnit !== null && (
                <> + Distribución <span className="font-semibold">{formatearMoneda(Math.round(distUnit))}</span></>
              )}
              <span className="text-gray-400"> por unidad expedida</span>
            </p>
          </div>
          {distUnit === null && (
            <p className="text-xs text-amber-600 mt-1">Sin factura de distribución de {formatMes(whUltimo.mes)} todavía — el total muestra solo warehouse</p>
          )}
          <p className="text-xs text-gray-400 mt-1">Montos sin IVA · la preparación del warehouse se factura por unidad y la distribución por envío</p>
        </div>
      )}

      {/* Warehouse */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Warehouse (fulfillment)</h2>
        <p className="text-xs text-gray-500 mb-4">Lo que cobra Andreani por operar el depósito: recibir, almacenar, preparar pedidos, insumos y seguro del stock</p>
        {whMeses.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Sin facturas de warehouse cargadas. Subí el Excel en la solapa Carga de Factura.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="py-2 px-3 font-medium">Mes</th>
                  <th className="py-2 px-3 font-medium text-right">Unidades</th>
                  {buckets.map(b => (
                    <th key={b.key} className="py-2 px-3 font-medium text-right">{b.label}</th>
                  ))}
                  <th className="py-2 px-3 font-medium text-right">Total</th>
                  <th className="py-2 px-3 font-medium text-right">$ / unidad</th>
                  <th className="py-2 px-3 font-medium text-right">$ / pedido</th>
                </tr>
              </thead>
              <tbody>
                {whMeses.map(m => (
                  <tr key={m.mes} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium text-gray-900">{formatMes(m.mes)}</td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {m.unidades.toLocaleString('es-AR')}
                      <span className="text-gray-400 text-xs"> ({m.pedidos.toLocaleString('es-AR')} ped.)</span>
                    </td>
                    {buckets.map(b => (
                      <td key={b.key} className="py-2 px-3 text-right text-gray-700">
                        <div>{formatearMoneda(Math.round(m.desglose[b.key]))}</div>
                        <div className="text-[10px] text-gray-400">
                          {m.unidades > 0 ? `${formatearMoneda(Math.round(m.desglose[b.key] / m.unidades))}/u` : ''}
                        </div>
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">{formatearMoneda(Math.round(m.total))}</td>
                    <td className="py-2 px-3 text-right font-semibold text-magenta-700">
                      {m.unidades > 0 ? formatearMoneda(Math.round(m.total / m.unidades)) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {m.pedidos > 0 ? formatearMoneda(Math.round(m.total / m.pedidos)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Distribución */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Distribución</h2>
        <p className="text-xs text-gray-500 mb-4">Lo que cobra Andreani por llevar cada envío al cliente: costo de distribución y seguro del envío</p>
        {distribucion.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Sin facturas de distribución conciliadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="py-2 px-3 font-medium">Mes</th>
                  <th className="py-2 px-3 font-medium text-right">Envíos</th>
                  <th className="py-2 px-3 font-medium text-right">Costo distribución</th>
                  <th className="py-2 px-3 font-medium text-right">Seguro distribución</th>
                  <th className="py-2 px-3 font-medium text-right">Total</th>
                  <th className="py-2 px-3 font-medium text-right">$ / envío</th>
                </tr>
              </thead>
              <tbody>
                {distribucion.map(d => {
                  const total = d.distribucion + d.seguro
                  return (
                    <tr key={d.mes} className="border-b border-gray-100">
                      <td className="py-2 px-3 font-medium text-gray-900">{formatMes(d.mes)}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{d.envios.toLocaleString('es-AR')}</td>
                      <td className="py-2 px-3 text-right text-gray-700">
                        <div>{formatearMoneda(Math.round(d.distribucion))}</div>
                        <div className="text-[10px] text-gray-400">{d.envios > 0 ? `${formatearMoneda(Math.round(d.distribucion / d.envios))}/env.` : ''}</div>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700">
                        <div>{formatearMoneda(Math.round(d.seguro))}</div>
                        <div className="text-[10px] text-gray-400">{d.envios > 0 ? `${formatearMoneda(Math.round(d.seguro / d.envios))}/env.` : ''}</div>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-gray-900">{formatearMoneda(Math.round(total))}</td>
                      <td className="py-2 px-3 text-right font-semibold text-magenta-700">
                        {d.envios > 0 ? formatearMoneda(Math.round(total / d.envios)) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-2">Agosto 2026 normalizado por el valor declarado erróneo (seguro a $2.800 y distribución a tarifa de localidad, NC de Andreani pendiente)</p>
      </div>
    </div>
  )
}
