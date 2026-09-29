export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBusqueda } from '@/lib/actions/reclutamiento'
import CuadroComparativo from '@/components/reclutamiento/CuadroComparativo'
import AgregarCandidato from '@/components/reclutamiento/AgregarCandidato'
import Recomendacion from '@/components/reclutamiento/Recomendacion'

export default async function BusquedaPage({ params }: { params: { id: string } }) {
  const busqueda = await getBusqueda(params.id)
  if (!busqueda) notFound()

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/reclutamiento" className="text-sm text-indigo-700 hover:underline">
        ← Búsquedas
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mt-2 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{busqueda.nombre}</h1>
          {busqueda.mandato && <p className="text-sm text-gray-500 max-w-3xl">{busqueda.mandato}</p>}
        </div>
        <AgregarCandidato busquedaId={busqueda.id} />
      </div>
      <p className="text-xs text-gray-400 mb-5">
        Criterios ({busqueda.criterios.filter((c) => c.prioritario).length} prioritarios *):{' '}
        {busqueda.criterios.map((c) => c.nombre + (c.prioritario ? '*' : '')).join(' · ')}
      </p>

      {busqueda.candidatos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
          Sin candidatos todavía. Subí el primer CV de LinkedIn con el botón &quot;+ Candidato (PDF)&quot;.
        </div>
      ) : (
        <>
          <CuadroComparativo busqueda={busqueda} />
          <Recomendacion
            busquedaId={busqueda.id}
            recomendacion={busqueda.recomendacion}
            recomendacionAt={busqueda.recomendacion_at}
          />
        </>
      )}
    </div>
  )
}
