import { getCostoPorCiudad, getProvinciasDisponibles, getFacturasEnvios } from '@/lib/actions/envios'
import { formatearMoneda } from '@/lib/utils'
import ProvinciaFilter from './ProvinciaFilter'

export default async function CostoCiudad({ provincia }: { provincia?: string }) {
  const [datos, provincias, facturas] = await Promise.all([
    getCostoPorCiudad(provincia),
    getProvinciasDisponibles(),
    getFacturasEnvios(),
  ])

  // Costo por envío: total facturado / total envíos de todas las facturas
  const totalFacturado = facturas.reduce((s, f) => s + f.total_facturado, 0)
  const totalEnviosFacturas = facturas.reduce((s, f) => s + f.total_envios, 0)
  const costoPromedioEnvio = totalEnviosFacturas > 0 ? Math.round(totalFacturado / totalEnviosFacturas) : 0

  // Get all unique months across all cities
  const allMeses = [...new Set(datos.flatMap(d => d.meses.map(m => m.mes)))].sort()

  // Global summary
  const resumenMensual = allMeses.map(mes => {
    let totalEnvios = 0
    let totalCosto = 0
    for (const ciudad of datos) {
      const m = ciudad.meses.find(x => x.mes === mes)
      if (m) {
        totalEnvios += m.envios
        totalCosto += m.costo_total
      }
    }
    return { mes, envios: totalEnvios, costo: totalCosto, promedio: totalEnvios > 0 ? Math.round(totalCosto / totalEnvios) : 0 }
  })

  // Global variation
  let variacionGlobal: number | null = null
  if (resumenMensual.length >= 2) {
    const prev = resumenMensual[resumenMensual.length - 2].promedio
    const curr = resumenMensual[resumenMensual.length - 1].promedio
    if (prev > 0) variacionGlobal = Math.round(((curr - prev) / prev) * 1000) / 10
  }

  const formatMes = (mes: string) => {
    const [y, m] = mes.split('-')
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    return `${nombres[parseInt(m) - 1]} ${y}`
  }

  return (
    <div className="space-y-6">
      {/* Filtro por ciudad */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600 font-medium">Ciudad:</label>
        <ProvinciaFilter provincias={provincias} actual={provincia} />
      </div>

      {datos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
          No hay datos de envíos conciliados{provincia ? ` para ${provincia}` : ''}. Cargá una factura primero.
        </div>
      ) : (
        <>
          {/* Costo por envío */}
          <div className="bg-white border border-orange-200 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-orange-600 uppercase tracking-wide">Costo promedio por envío</p>
              <p className="text-3xl font-bold text-orange-700 mt-1">{formatearMoneda(costoPromedioEnvio)}</p>
              <p className="text-xs text-gray-400 mt-1">Total facturado sin IVA / cantidad de envíos</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{totalEnviosFacturas.toLocaleString('es-AR')} envíos</p>
              <p className="text-sm font-semibold text-gray-700">{formatearMoneda(totalFacturado)} facturado</p>
              <p className="text-xs text-gray-400 mt-1">{facturas.length} factura{facturas.length !== 1 ? 's' : ''} cargada{facturas.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Tabla por provincia */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{provincia ? 'Ciudad' : 'Provincia'}</th>
                  {allMeses.map(m => (
                    <th key={m} className="text-right px-4 py-3 font-medium text-gray-600">{formatMes(m)}</th>
                  ))}
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Prom. gral.</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Var. %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {datos.map(d => {
                  const totalEnvios = d.meses.reduce((s, m) => s + m.envios, 0)
                  const totalCosto = d.meses.reduce((s, m) => s + m.costo_total, 0)
                  const promGral = totalEnvios > 0 ? Math.round(totalCosto / totalEnvios) : 0
                  return (
                    <tr key={d.ciudad} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900 text-xs whitespace-nowrap">{d.ciudad}</td>
                      {allMeses.map(mes => {
                        const m = d.meses.find(x => x.mes === mes)
                        return (
                          <td key={mes} className="px-4 py-2 text-right text-xs text-gray-700">
                            {m && m.envios > 0 ? (
                              <div>
                                <span className="font-medium">{formatearMoneda(m.costo_promedio)}</span>
                                <span className="text-gray-400 ml-1">({m.envios})</span>
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-900">
                        {formatearMoneda(promGral)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold">
                        {d.variacion_pct !== null ? (
                          <span className={d.variacion_pct > 0 ? 'text-red-600' : 'text-green-700'}>
                            {d.variacion_pct > 0 ? '+' : ''}{d.variacion_pct}%
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
