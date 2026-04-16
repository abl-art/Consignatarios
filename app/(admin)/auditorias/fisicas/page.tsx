import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Auditoria, Consignatario } from '@/lib/types'
import AuditoriaTabs from '../AuditoriaTabs'

export default async function AuditoriasFisicasPage() {
  const supabase = createClient()

  const [{ data: auditorias }, { data: consignatarios }] = await Promise.all([
    supabase
      .from('auditorias')
      .select('*')
      .eq('tipo', 'fisica')
      .order('created_at', { ascending: false })
      .returns<Auditoria[]>(),
    supabase
      .from('consignatarios')
      .select('id, nombre')
      .order('nombre')
      .returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  const consigMap = (consignatarios ?? []).reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = c.nombre
    return acc
  }, {})

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Auditorías</h1>
        <Link
          href="/auditorias/nueva"
          className="px-4 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 transition-colors"
        >
          Nueva auditoría
        </Link>
      </div>

      <AuditoriaTabs />

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {!auditorias || auditorias.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            <p className="text-sm">No hay auditorías registradas.</p>
            <p className="text-xs text-gray-400 mt-1">
              Creá una nueva auditoría para comenzar.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Consignatario</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Realizada por</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {auditorias.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-700">
                    {new Date(a.fecha).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-6 py-3 font-medium text-gray-900">
                    {consigMap[a.consignatario_id] ?? a.consignatario_id}
                  </td>
                  <td className="px-6 py-3 text-gray-600">{a.realizada_por}</td>
                  <td className="px-6 py-3">
                    {a.estado === 'confirmada' ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Confirmada
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        Borrador
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right flex gap-2 justify-end">
                    {a.estado === 'confirmada' && (
                      <a href={`/api/pdf/auditoria/${a.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-green-600 hover:text-green-800 text-xs font-medium">PDF</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
