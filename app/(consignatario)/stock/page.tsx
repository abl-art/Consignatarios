import { createClient } from '@/lib/supabase/server'
import { getCurrentConsignatario } from '@/lib/consignatario-helpers'
import { diasDesde, clasificarAntiguedad } from '@/lib/utils'
import type { DispositivoConModelo } from '@/lib/types'

export default async function StockPage() {
  const consignatario = await getCurrentConsignatario()
  const supabase = createClient()

  const { data: dispositivos } = await supabase
    .from('dispositivos')
    .select('*, modelos(*)')
    .eq('consignatario_id', consignatario.id)
    .eq('estado', 'asignado')
    .returns<DispositivoConModelo[]>()

  interface GrupoRow {
    marca: string
    modelo: string
    cantidad: number
    sumaDias: number
    promedioDias: number | null
  }
  const grupos: Record<string, GrupoRow> = {}
  for (const d of dispositivos ?? []) {
    const key = `${d.modelos.marca}__${d.modelos.modelo}`
    if (!grupos[key]) {
      grupos[key] = { marca: d.modelos.marca, modelo: d.modelos.modelo, cantidad: 0, sumaDias: 0, promedioDias: null }
    }
    grupos[key].cantidad++
    const dias = diasDesde(d.fecha_asignacion)
    if (dias !== null) grupos[key].sumaDias += dias
  }
  for (const g of Object.values(grupos)) {
    g.promedioDias = g.cantidad > 0 ? Math.round(g.sumaDias / g.cantidad) : null
  }
  const rows = Object.values(grupos).sort((a, b) => a.marca.localeCompare(b.marca))
  const total = rows.reduce((s, r) => s + r.cantidad, 0)

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mi stock</h1>
      <p className="text-sm text-gray-500 mb-8">{total} equipos asignados en {rows.length} modelos</p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            <p className="text-sm">No tenés stock asignado.</p>
            <p className="text-xs text-gray-400 mt-1">Cuando te entreguen equipos, aparecerán acá.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Marca</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Cantidad</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Antigüedad promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const clase = clasificarAntiguedad(r.promedioDias)
                return (
                  <tr key={`${r.marca}-${r.modelo}`} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{r.marca}</td>
                    <td className="px-6 py-3 text-gray-700">{r.modelo}</td>
                    <td className="px-6 py-3 text-right font-bold text-gray-900">{r.cantidad}</td>
                    <td className="px-6 py-3 text-right">
                      {r.promedioDias !== null ? (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${clase.textColor} ${clase.bgColor}`}>
                          {r.promedioDias} {r.promedioDias === 1 ? 'día' : 'días'}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500 flex gap-4">
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>Menos de 30 días</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>30 a 60 días</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>Más de 60 días</span>
      </div>
    </div>
  )
}
