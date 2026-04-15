import { createClient } from '@/lib/supabase/server'
import ImportarCSV from './ImportarCSV'
import { revalidatePath } from 'next/cache'
import type { DispositivoConModelo, Consignatario } from '@/lib/types'

const ESTADOS_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  vendido: 'Vendido',
  devuelto: 'Devuelto',
}

const ESTADOS_COLORS: Record<string, string> = {
  disponible: 'bg-green-100 text-green-700',
  asignado: 'bg-blue-100 text-blue-700',
  vendido: 'bg-gray-100 text-gray-600',
  devuelto: 'bg-yellow-100 text-yellow-700',
}

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: { estado?: string; consignatario?: string }
}) {
  const supabase = createClient()

  let query = supabase
    .from('dispositivos')
    .select('*, modelos(*)')
    .order('created_at', { ascending: false })

  if (searchParams.estado) query = query.eq('estado', searchParams.estado)
  if (searchParams.consignatario) query = query.eq('consignatario_id', searchParams.consignatario)

  const [{ data: dispositivos }, { data: consignatarios }] = await Promise.all([
    query.returns<DispositivoConModelo[]>(),
    supabase.from('consignatarios').select('id, nombre').order('nombre').returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Inventario de dispositivos</h1>

      <div className="mb-6">
        <ImportarCSV onImportado={async () => { 'use server'; revalidatePath('/inventario') }} />
      </div>

      {/* Filtros */}
      <form className="flex gap-3 mb-6 flex-wrap">
        <select name="estado" defaultValue={searchParams.estado ?? ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="consignatario" defaultValue={searchParams.consignatario ?? ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todos los consignatarios</option>
          {consignatarios?.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <button type="submit"
          className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900">
          Filtrar
        </button>
      </form>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 text-sm text-gray-500">
          {dispositivos?.length ?? 0} dispositivos
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">IMEI</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha ingreso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dispositivos?.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                <td className="px-6 py-3 text-gray-900">{d.modelos.marca} {d.modelos.modelo}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADOS_COLORS[d.estado]}`}>
                    {ESTADOS_LABELS[d.estado]}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-500">
                  {new Date(d.created_at).toLocaleDateString('es-AR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
