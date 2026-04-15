import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { Diferencia, Consignatario } from '@/lib/types'
import DiferenciaActions from './DiferenciaActions'

interface DifRow extends Diferencia {
  dispositivos: { imei: string; modelos: { marca: string; modelo: string } }
  auditorias: { consignatario_id: string }
}

interface SearchParams {
  consignatario?: string
  tipo?: string
  estado?: string
}

export default async function DiferenciasPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = createClient()

  // Build query
  let query = supabase
    .from('diferencias')
    .select('*, dispositivos(imei, modelos(marca, modelo)), auditorias(consignatario_id)')
    .order('created_at', { ascending: false })

  if (searchParams.tipo) {
    query = query.eq('tipo', searchParams.tipo)
  }
  if (searchParams.estado) {
    query = query.eq('estado', searchParams.estado)
  }

  const [{ data: rawDiferencias }, { data: consignatarios }] = await Promise.all([
    query.returns<DifRow[]>(),
    supabase.from('consignatarios').select('id, nombre').order('nombre').returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  const diferencias = rawDiferencias ?? []
  const consignatariosList = consignatarios ?? []

  // Map id -> nombre
  const consignatarioMap = Object.fromEntries(
    consignatariosList.map((c) => [c.id, c.nombre]),
  )

  // Client-side filter by consignatario (nested in auditorias)
  const filtered = searchParams.consignatario
    ? diferencias.filter(
        (d) => d.auditorias?.consignatario_id === searchParams.consignatario,
      )
    : diferencias

  // Summary counts
  const pendientes = filtered.filter((d) => d.estado === 'pendiente')
  const cobrados = filtered.filter((d) => d.estado === 'cobrado')
  const totalMontoPendiente = pendientes.reduce((sum, d) => sum + (d.monto_deuda ?? 0), 0)
  const totalMontoCobrado = cobrados.reduce((sum, d) => sum + (d.monto_deuda ?? 0), 0)

  const estadoBadge: Record<string, string> = {
    pendiente: 'bg-red-100 text-red-700',
    cobrado: 'bg-green-100 text-green-700',
    resuelto: 'bg-blue-100 text-blue-700',
  }

  const tipoBadge: Record<string, string> = {
    faltante: 'bg-orange-100 text-orange-700',
    sobrante: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Diferencias</h1>
      <p className="text-sm text-gray-500 mb-8">Faltantes y sobrantes detectados en auditorías</p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Pendientes</p>
          <p className="text-2xl font-bold text-red-600">{pendientes.length}</p>
          <p className="text-xs text-gray-400 mt-1">{formatearMoneda(totalMontoPendiente)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Cobrados</p>
          <p className="text-2xl font-bold text-green-600">{cobrados.length}</p>
          <p className="text-xs text-gray-400 mt-1">{formatearMoneda(totalMontoCobrado)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Total diferencias</p>
          <p className="text-2xl font-bold text-gray-800">{filtered.length}</p>
        </div>
      </div>

      {/* Filter form */}
      <form method="GET" className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Consignatario</label>
          <select
            name="consignatario"
            defaultValue={searchParams.consignatario ?? ''}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[180px]"
          >
            <option value="">Todos</option>
            {consignatariosList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Tipo</label>
          <select
            name="tipo"
            defaultValue={searchParams.tipo ?? ''}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todos</option>
            <option value="faltante">Faltante</option>
            <option value="sobrante">Sobrante</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Estado</label>
          <select
            name="estado"
            defaultValue={searchParams.estado ?? ''}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="cobrado">Cobrado</option>
            <option value="resuelto">Resuelto</option>
          </select>
        </div>

        <button
          type="submit"
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          Filtrar
        </button>
      </form>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">No hay diferencias registradas con los filtros aplicados.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  IMEI
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Modelo
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Consignatario
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Tipo
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Monto
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Estado
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((dif) => {
                const consignatarioId = dif.auditorias?.consignatario_id
                const consignatarioNombre = consignatarioId
                  ? (consignatarioMap[consignatarioId] ?? consignatarioId)
                  : '—'
                const modelo = dif.dispositivos?.modelos
                  ? `${dif.dispositivos.modelos.marca} ${dif.dispositivos.modelos.modelo}`
                  : '—'

                return (
                  <tr key={dif.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {dif.dispositivos?.imei ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{modelo}</td>
                    <td className="px-4 py-3 text-gray-700">{consignatarioNombre}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tipoBadge[dif.tipo] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {dif.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">
                      {formatearMoneda(dif.monto_deuda ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${estadoBadge[dif.estado] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {dif.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DiferenciaActions id={dif.id} estado={dif.estado} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
