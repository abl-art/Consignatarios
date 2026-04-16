import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import { autoBloquearRetenidas } from '@/lib/actions/liquidaciones'
import { RowActions, GenerarButton } from './LiquidacionesActions'
import type { Consignatario, Liquidacion } from '@/lib/types'

const ESTADO_COLORS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-700',
  retenida: 'bg-yellow-100 text-yellow-700',
  pendiente: 'bg-blue-100 text-blue-700',
  bloqueada: 'bg-red-100 text-red-700',
  pagada: 'bg-green-100 text-green-700',
}

function mesAnterior(): string {
  const now = new Date()
  now.setMonth(now.getMonth() - 1)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function LiquidacionesPage({
  searchParams,
}: {
  searchParams: { mes?: string; consignatario?: string; estado?: string }
}) {
  await autoBloquearRetenidas()

  const supabase = createClient()
  const mesFiltro = searchParams.mes ?? mesAnterior()

  let query = supabase
    .from('liquidaciones')
    .select('*')
    .order('mes', { ascending: false })

  if (mesFiltro) query = query.eq('mes', mesFiltro)
  if (searchParams.consignatario) query = query.eq('consignatario_id', searchParams.consignatario)
  if (searchParams.estado) query = query.eq('estado', searchParams.estado)

  const [{ data: liquidaciones }, { data: consignatarios }] = await Promise.all([
    query.returns<Liquidacion[]>(),
    supabase
      .from('consignatarios')
      .select('id, nombre')
      .order('nombre')
      .returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  const liqs = liquidaciones ?? []
  const consigList = consignatarios ?? []

  const consigMap = consigList.reduce<Record<string, string>>((m, c) => {
    m[c.id] = c.nombre
    return m
  }, {})

  const totalPorPagar = liqs
    .filter((l) => l.estado === 'pendiente')
    .reduce((s, l) => s + l.monto_a_pagar, 0)
  const totalRetenido = liqs
    .filter((l) => l.estado === 'retenida')
    .reduce((s, l) => s + l.monto_a_pagar, 0)
  const totalBloqueado = liqs
    .filter((l) => l.estado === 'bloqueada')
    .reduce((s, l) => s + l.monto_a_pagar, 0)

  // Build last 12 months for mes filter dropdown
  const meses: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Liquidaciones</h1>
      <p className="text-sm text-gray-500 mb-8">Comisiones mensuales por consignatario</p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Por pagar (pendientes)</p>
          <p className="text-2xl font-bold text-blue-700">{formatearMoneda(totalPorPagar)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Retenido</p>
          <p className="text-2xl font-bold text-yellow-700">{formatearMoneda(totalRetenido)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Bloqueado</p>
          <p className="text-2xl font-bold text-red-700">{formatearMoneda(totalBloqueado)}</p>
        </div>
      </div>

      {/* Generate button */}
      <div className="mb-6">
        <GenerarButton />
      </div>

      {/* Filter form */}
      <form
        method="GET"
        className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Mes</label>
          <select
            name="mes"
            defaultValue={mesFiltro}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {meses.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Consignatario</label>
          <select
            name="consignatario"
            defaultValue={searchParams.consignatario ?? ''}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[180px]"
          >
            <option value="">Todos</option>
            {consigList.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
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
            <option value="borrador">Borrador</option>
            <option value="retenida">Retenida</option>
            <option value="pendiente">Pendiente</option>
            <option value="bloqueada">Bloqueada</option>
            <option value="pagada">Pagada</option>
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
      {liqs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">
            Sin liquidaciones para este filtro. Usá el botón de arriba para generarlas.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Mes
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Consignatario
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Comisiones
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Diferencias
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  A pagar
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Estado
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liqs.map((liq) => (
                <tr key={liq.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700">
                    {liq.fecha_inicio && liq.fecha_fin ? (
                      <div>
                        <span className="text-xs">{new Date(liq.fecha_inicio + 'T12:00:00').toLocaleDateString('es-AR')} — {new Date(liq.fecha_fin + 'T12:00:00').toLocaleDateString('es-AR')}</span>
                      </div>
                    ) : (
                      liq.mes
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {consigMap[liq.consignatario_id] ?? liq.consignatario_id}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatearMoneda(liq.total_comisiones)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {liq.total_diferencias_descontadas > 0
                      ? `−${formatearMoneda(liq.total_diferencias_descontadas)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {formatearMoneda(liq.monto_a_pagar)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ESTADO_COLORS[liq.estado] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {liq.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <a href={`/api/pdf/liquidacion/${liq.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-medium text-magenta-600 hover:text-magenta-800">PDF</a>
                      <RowActions id={liq.id} estado={liq.estado} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
