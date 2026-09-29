export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCandidato, urlCv } from '@/lib/actions/reclutamiento'
import EditarScores from '@/components/reclutamiento/EditarScores'
import EntrevistaCard from '@/components/reclutamiento/EntrevistaCard'
import NuevaEntrevista from '@/components/reclutamiento/NuevaEntrevista'

export default async function CandidatoPage({ params }: { params: { id: string; cid: string } }) {
  const candidato = await getCandidato(params.cid)
  if (!candidato) notFound()
  const cvUrl = candidato.cv_path ? await urlCv(candidato.cv_path) : null

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href={`/reclutamiento/${candidato.busqueda.id}`} className="text-sm text-indigo-700 hover:underline">
        ← {candidato.busqueda.nombre}
      </Link>

      <div className="bg-indigo-700 text-white rounded-xl px-6 py-5 mt-3 mb-5">
        <h1 className="text-2xl font-bold">{candidato.nombre}</h1>
        <p className="text-indigo-200 text-sm mt-1">
          {[candidato.arquetipo, ...candidato.etiquetas].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <EditarScores
            candidatoId={candidato.id}
            criterios={candidato.busqueda.criterios}
            scores={candidato.scores}
          />
          {cvUrl && (
            <a
              href={cvUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 shrink-0"
            >
              Ver CV (PDF)
            </a>
          )}
        </div>
        {candidato.resumen && <p className="text-sm text-gray-700 mb-4">{candidato.resumen}</p>}
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm mb-2">A favor</h3>
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
              {candidato.favor.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm mb-2">Riesgos / a validar</h3>
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
              {candidato.riesgos.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
        {candidato.preguntas && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 mt-4 text-sm text-gray-700">
            <b>Preguntas / próximos pasos:</b> {candidato.preguntas}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900">Entrevistas</h2>
        <NuevaEntrevista candidatoId={candidato.id} />
      </div>
      {candidato.entrevistas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
          Sin entrevistas. Pegá el link de Drive del video con el botón &quot;+ Entrevista&quot; — se
          transcribe y analiza sola (el video queda privado, en tu Drive).
        </div>
      ) : (
        candidato.entrevistas.map((e) => <EntrevistaCard key={e.id} entrevista={e} />)
      )}
    </div>
  )
}
