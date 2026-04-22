'use client'

import type { ProductoFinanciero } from '@/lib/actions/productos'
import type { SimuladorParams } from '@/lib/simulador'

interface Props {
  productos: ProductoFinanciero[]
}

export default function ListaPreciosTab({ productos }: Props) {
  if (productos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-400 text-sm">No hay productos guardados. Creá productos en la pestaña &quot;Productos y Simulación&quot; para armar la lista de precios.</p>
      </div>
    )
  }

  // Extraer cuotas y estructuras de liquidación únicas
  const productosConParams = productos.map(p => {
    const params = p.parametros as unknown as SimuladorParams
    const splitsKey = params.splits.map(s => `${s.porcentaje}% a ${s.plazo_dias}d`).join(' / ')
    return { ...p, params, splitsKey }
  })

  const cuotasUnicas = [...new Set(productosConParams.map(p => p.params.cuotas))].sort((a, b) => a - b)
  const liquidacionesUnicas = [...new Set(productosConParams.map(p => p.splitsKey))]

  // Armar mapa de lookup: cuotas + liquidación → tasa
  const lookup = new Map<string, number>()
  for (const p of productosConParams) {
    const key = `${p.params.cuotas}-${p.splitsKey}`
    lookup.set(key, p.params.tasa_descuento_comercio)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Lista de Precios — Tasa de Descuento al Comercio</h3>
          <p className="text-xs text-gray-500 mt-1">Cuotas x Estructura de Liquidación</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cuotas</th>
                {liquidacionesUnicas.map(liq => (
                  <th key={liq} className="text-center px-4 py-3 font-medium text-gray-600 min-w-[140px]">
                    <div className="text-xs">{liq}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cuotasUnicas.map(cuotas => (
                <tr key={cuotas} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{cuotas} cuotas</td>
                  {liquidacionesUnicas.map(liq => {
                    const key = `${cuotas}-${liq}`
                    const tasa = lookup.get(key)
                    return (
                      <td key={liq} className="px-4 py-3 text-center">
                        {tasa !== undefined ? (
                          <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-sm">
                            {tasa}%
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
