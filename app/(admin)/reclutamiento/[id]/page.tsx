export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBusqueda } from '@/lib/actions/reclutamiento'
import SectionTabs from '@/components/SectionTabs'
import CuadroComparativo from '@/components/reclutamiento/CuadroComparativo'
import AgregarCandidato from '@/components/reclutamiento/AgregarCandidato'
import Recomendacion from '@/components/reclutamiento/Recomendacion'

// Pipeline de la búsqueda: pestaña Entrevista (candidatos en evaluación) y
// pestaña Assessment (los tildados como "pasa"). El checkbox del cuadro mueve
// candidatos entre etapas.
export default async function BusquedaPage({ params }: { params: { id: string } }) {
  const busqueda = await getBusqueda(params.id)
  if (!busqueda) notFound()

  const enEntrevista = busqueda.candidatos.filter((c) => c.assessment === 'pendiente')
  const enAssessment = busqueda.candidatos.filter((c) => c.assessment === 'pasa')
  const rechazados = busqueda.candidatos.filter((c) => c.assessment === 'no_pasa')

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
        <SectionTabs
          tabs={[
            {
              id: 'entrevista',
              label: `Entrevista (${enEntrevista.length})`,
              content: (
                <>
                  <CuadroComparativo busqueda={busqueda} candidatos={enEntrevista} />
                  <Recomendacion
                    busquedaId={busqueda.id}
                    recomendacion={busqueda.recomendacion}
                    recomendacionAt={busqueda.recomendacion_at}
                  />
                </>
              ),
            },
            {
              id: 'assessment',
              label: `Assessment (${enAssessment.length})`,
              content: (
                <>
                  <CuadroComparativo busqueda={busqueda} candidatos={enAssessment} />
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    Próxima iteración: puntaje propio de la etapa Assessment en función del caso a
                    resolver. Por ahora esta pestaña agrupa a los candidatos promovidos; destildá el
                    checkbox para devolver a alguien a Entrevista.
                  </div>
                </>
              ),
            },
            {
              id: 'rechazados',
              label: `Rechazados (${rechazados.length})`,
              content: (
                <>
                  <CuadroComparativo busqueda={busqueda} candidatos={rechazados} />
                  <p className="text-xs text-gray-400">
                    Candidatos marcados como &quot;No sigue&quot;. Destildá el checkbox para
                    devolverlos a la etapa Entrevista — no se borra nada, la ficha y las entrevistas
                    quedan guardadas.
                  </p>
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
