export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getBusquedas } from '@/lib/actions/reclutamiento'
import NuevaBusqueda from '@/components/reclutamiento/NuevaBusqueda'

export default async function ReclutamientoPage() {
  const busquedas = await getBusquedas()

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Reclutamiento</h1>
          <p className="text-sm text-gray-500">
            Búsquedas de personal con análisis IA: subí CVs de LinkedIn y links de entrevistas, y
            obtené el cuadro comparativo con recomendación
          </p>
        </div>
        <NuevaBusqueda />
      </div>

      {busquedas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
          Todavía no hay búsquedas. Creá la primera con el botón de arriba.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {busquedas.map((b) => (
            <Link
              key={b.id}
              href={`/reclutamiento/${b.id}`}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="bg-indigo-700 text-white px-5 py-3 flex items-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 11-3-3" />
                </svg>
                <span className="font-semibold">{b.nombre}</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 line-clamp-2 mb-3">{b.mandato || 'Sin mandato definido'}</p>
                <p className="text-xs text-gray-400">
                  {b.candidatos} candidato{b.candidatos === 1 ? '' : 's'} · creada el{' '}
                  {new Date(b.created_at).toLocaleDateString('es-AR')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
