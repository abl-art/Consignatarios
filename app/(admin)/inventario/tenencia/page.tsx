import { createClient } from '@/lib/supabase/server'
import { diasDesde, clasificarAntiguedad, formatearMoneda } from '@/lib/utils'
import { getMejorPrecio, buscarPrecio } from '@/lib/actions/compras'
import type { Consignatario } from '@/lib/types'

type DispositivoRow = {
  id: string
  fecha_asignacion: string | null
  consignatario_id: string | null
  modelos: { marca: string; modelo: string; precio_costo: number } | null
}

interface GrupoModelo {
  marca: string
  modelo: string
  cantidad: number
  sumaDias: number
  promedioDias: number | null
  valorCosto: number
  precioUnit: number
  valorTotal: number
}

interface GrupoConsignatario {
  id: string
  nombre: string
  total: number
  valorCosto: number
  valorTotal: number
  modelos: GrupoModelo[]
}

export default async function TenenciaPage() {
  const supabase = createClient()

  const [{ data: dispositivos }, { data: consignatarios }, preciosNewsan] = await Promise.all([
    supabase
      .from('dispositivos')
      .select('id, fecha_asignacion, consignatario_id, modelos(marca, modelo, precio_costo)')
      .eq('estado', 'asignado'),
    supabase
      .from('consignatarios')
      .select('id, nombre')
      .order('nombre')
      .returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
    getMejorPrecio(),
  ])
  const rows = ((dispositivos ?? []) as unknown as DispositivoRow[])

  // Agrupar por consignatario -> modelo
  const map: Record<string, Record<string, GrupoModelo>> = {}
  for (const d of rows) {
    if (!d.consignatario_id || !d.modelos) continue
    const key = `${d.modelos.marca}__${d.modelos.modelo}`
    if (!map[d.consignatario_id]) map[d.consignatario_id] = {}
    const bucket = map[d.consignatario_id]
    if (!bucket[key]) {
      const nombreModelo = `${d.modelos.marca} ${d.modelos.modelo}`
      const precioUnit = buscarPrecio(preciosNewsan, nombreModelo)
      bucket[key] = { marca: d.modelos.marca, modelo: d.modelos.modelo, cantidad: 0, sumaDias: 0, promedioDias: null, valorCosto: 0, precioUnit, valorTotal: 0 }
    }
    const costo = d.modelos.precio_costo ?? 0
    bucket[key].cantidad++
    bucket[key].valorCosto += costo
    bucket[key].valorTotal = bucket[key].cantidad * bucket[key].precioUnit
    const dias = diasDesde(d.fecha_asignacion)
    if (dias !== null) bucket[key].sumaDias += dias
  }

  const consigArray: GrupoConsignatario[] = (consignatarios ?? [])
    .map((c) => {
      const bucket = map[c.id] ?? {}
      const modelos: GrupoModelo[] = Object.values(bucket)
        .map((g) => ({ ...g, promedioDias: g.cantidad > 0 ? Math.round(g.sumaDias / g.cantidad) : null }))
        .sort((a, b) => b.cantidad - a.cantidad)
      const total = modelos.reduce((s, m) => s + m.cantidad, 0)
      const valorCosto = modelos.reduce((s, m) => s + m.valorCosto, 0)
      const valorTotal = modelos.reduce((s, m) => s + m.valorTotal, 0)
      return { id: c.id, nombre: c.nombre, total, valorCosto, valorTotal, modelos }
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)

  const totalGeneral = consigArray.reduce((s, c) => s + c.total, 0)
  const totalCostoGeneral = consigArray.reduce((s, c) => s + c.valorCosto, 0)
  const totalVentaGeneral = consigArray.reduce((s, c) => s + c.valorTotal, 0)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Tenencia por consignatario</h1>
      <p className="text-sm text-gray-500 mb-6">Equipos actualmente asignados, agrupados por consignatario y modelo</p>

      <div className="bg-magenta-50 border border-magenta-200 rounded-xl p-4 mb-6 flex flex-wrap gap-6 text-sm">
        <div>
          <p className="text-xs text-gray-500">Consignatarios</p>
          <p className="font-bold text-gray-900">{consigArray.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Equipos</p>
          <p className="font-bold text-magenta-700">{totalGeneral}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Valor costo</p>
          <p className="font-bold text-gray-900">{formatearMoneda(totalCostoGeneral)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Valor stock</p>
          <p className="font-bold text-green-700">{formatearMoneda(totalVentaGeneral)}</p>
        </div>
      </div>

      {consigArray.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Ningún consignatario tiene equipos asignados.
        </div>
      ) : (
        <div className="space-y-4">
          {consigArray.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
                <h2 className="font-bold text-gray-900">{c.nombre}</h2>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Costo</p>
                    <p className="text-sm font-semibold text-gray-700">{formatearMoneda(c.valorCosto)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Valor</p>
                    <p className="text-sm font-semibold text-green-700">{formatearMoneda(c.valorTotal)}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-magenta-700">{c.total}</span>
                    <span className="text-sm text-gray-500 ml-1">{c.total === 1 ? 'eq.' : 'eq.'}</span>
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-white">
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-2 font-medium text-gray-600">Marca</th>
                    <th className="text-left px-6 py-2 font-medium text-gray-600">Modelo</th>
                    <th className="text-right px-6 py-2 font-medium text-gray-600">Cant.</th>
                    <th className="text-right px-6 py-2 font-medium text-gray-600">Precio unit.</th>
                    <th className="text-right px-6 py-2 font-medium text-gray-600">Total</th>
                    <th className="text-right px-6 py-2 font-medium text-gray-600">Antig. prom.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {c.modelos.map((m) => {
                    const clase = clasificarAntiguedad(m.promedioDias)
                    return (
                      <tr key={`${m.marca}-${m.modelo}`} className="hover:bg-gray-50">
                        <td className="px-6 py-2 font-medium text-gray-900">{m.marca}</td>
                        <td className="px-6 py-2 text-gray-700">{m.modelo}</td>
                        <td className="px-6 py-2 text-right font-bold text-gray-900">{m.cantidad}</td>
                        <td className="px-6 py-2 text-right text-gray-600">{m.precioUnit > 0 ? formatearMoneda(m.precioUnit) : '—'}</td>
                        <td className="px-6 py-2 text-right font-medium text-green-700">{m.valorTotal > 0 ? formatearMoneda(m.valorTotal) : '—'}</td>
                        <td className="px-6 py-2 text-right">
                          {m.promedioDias !== null ? (
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${clase.textColor} ${clase.bgColor}`}>
                              {m.promedioDias} {m.promedioDias === 1 ? 'día' : 'días'}
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
