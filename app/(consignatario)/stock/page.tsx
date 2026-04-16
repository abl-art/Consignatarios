import { createClient } from '@/lib/supabase/server'
import { getCurrentConsignatario } from '@/lib/consignatario-helpers'
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

  const grupos: Record<string, { marca: string; modelo: string; cantidad: number }> = {}
  for (const d of dispositivos ?? []) {
    const key = `${d.modelos.marca}__${d.modelos.modelo}`
    if (!grupos[key]) grupos[key] = { marca: d.modelos.marca, modelo: d.modelos.modelo, cantidad: 0 }
    grupos[key].cantidad++
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={`${r.marca}-${r.modelo}`} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{r.marca}</td>
                  <td className="px-6 py-3 text-gray-700">{r.modelo}</td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">{r.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
