'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { setAssessment, type BusquedaCompleta, type CandidatoRow } from '@/lib/actions/reclutamiento'
import type { AnalisisEntrevista } from '@/lib/reclutamiento'

// Preguntas y respuestas resumidas de la última entrevista analizada del candidato
function qaDe(c: CandidatoRow): { pregunta: string; respuesta: string }[] {
  for (let i = c.entrevistas.length - 1; i >= 0; i--) {
    const qa = (c.entrevistas[i].analisis as AnalisisEntrevista | null)?.qa
    if (qa && qa.length > 0) return qa
  }
  return []
}

const COLOR_SCORE: Record<number, string> = {
  5: 'bg-green-800',
  4: 'bg-lime-700',
  3: 'bg-yellow-700',
  2: 'bg-orange-700',
  1: 'bg-red-700',
}

function Chip({ n }: { n: number | undefined }) {
  if (!n) return <span className="text-gray-300">—</span>
  return (
    <span className={`inline-block w-8 rounded-md text-white text-sm font-bold py-0.5 ${COLOR_SCORE[n] || 'bg-gray-400'}`}>
      {n}
    </span>
  )
}

function badgeEntrevista(c: CandidatoRow): { texto: string; clase: string } {
  if (c.entrevistas.length === 0) return { texto: 'sin video', clase: 'bg-gray-100 text-gray-500' }
  if (c.entrevistas.some((e) => e.estado === 'error')) return { texto: 'error', clase: 'bg-red-100 text-red-700' }
  if (c.entrevistas.some((e) => e.estado !== 'listo')) return { texto: 'procesando…', clase: 'bg-blue-100 text-blue-700' }
  const veredicto = (c.entrevistas[c.entrevistas.length - 1].analisis as { veredicto?: string } | null)?.veredicto
  return { texto: veredicto ? `✓ ${veredicto}` : '✓ analizada', clase: 'bg-green-100 text-green-800' }
}

// Cuadro de una etapa del pipeline. El checkbox de la última columna promueve
// al candidato a la etapa Assessment (o lo devuelve a Entrevista si se destilda).
export default function CuadroComparativo({
  busqueda,
  candidatos,
}: {
  busqueda: BusquedaCompleta
  candidatos: CandidatoRow[]
}) {
  const router = useRouter()
  const [cambiando, setCambiando] = useState<string | null>(null)
  // Clic en la fila: muestra abajo las preguntas del ejercicio y sus respuestas
  const [verRespuestasDe, setVerRespuestasDe] = useState<string | null>(null)
  const seleccionado = candidatos.find((c) => c.id === verRespuestasDe) ?? null

  // 'pasa' y 'no_pasa' son excluyentes: tildar uno destilda el otro
  async function toggle(c: CandidatoRow, objetivo: 'pasa' | 'no_pasa') {
    setCambiando(c.id)
    try {
      await setAssessment(c.id, c.assessment === objetivo ? 'pendiente' : objetivo)
      router.refresh()
    } finally {
      setCambiando(null)
    }
  }

  const total = (c: CandidatoRow) =>
    busqueda.criterios.reduce((a, cr) => a + (c.scores[cr.clave] || 0), 0)
  const maxTotal = busqueda.criterios.length * 5

  if (candidatos.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500 mb-6">
        No hay candidatos en esta etapa.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="bg-indigo-50 text-xs uppercase tracking-wide text-gray-600">
            <th className="text-left px-4 py-3">Candidato/a</th>
            {busqueda.criterios.map((cr) => (
              <th key={cr.clave} className="px-2 py-3 text-center font-semibold">
                {cr.nombre}
                {cr.prioritario ? '*' : ''}
              </th>
            ))}
            <th className="px-2 py-3">Total /{maxTotal}</th>
            <th className="px-2 py-3">Entrevista</th>
            <th className="px-2 py-3">Arquetipo</th>
            <th className="px-2 py-3">Pasa a Assessment</th>
            <th className="px-2 py-3">No sigue</th>
          </tr>
        </thead>
        <tbody>
          {candidatos.map((c) => {
            const ent = badgeEntrevista(c)
            return (
              <tr
                key={c.id}
                onClick={() => setVerRespuestasDe(verRespuestasDe === c.id ? null : c.id)}
                className={`border-t border-gray-100 text-center cursor-pointer ${
                  verRespuestasDe === c.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
                title="Clic para ver sus respuestas al ejercicio abajo del cuadro"
              >
                <td className="text-left px-4 py-2.5 font-semibold">
                  <Link
                    href={`/reclutamiento/${busqueda.id}/${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-indigo-700 hover:underline"
                  >
                    {c.nombre}
                  </Link>
                </td>
                {busqueda.criterios.map((cr) => (
                  <td key={cr.clave} className="px-2 py-2.5">
                    <Chip n={c.scores[cr.clave]} />
                  </td>
                ))}
                <td className="px-2 py-2.5 font-extrabold text-base">{total(c)}</td>
                <td className="px-2 py-2.5">
                  <span className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 ${ent.clase}`}>
                    {ent.texto}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-gray-600">{c.arquetipo || '—'}</td>
                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={c.assessment === 'pasa'}
                    disabled={cambiando === c.id}
                    onChange={() => toggle(c, 'pasa')}
                    className="w-5 h-5 accent-indigo-700 cursor-pointer"
                    title={
                      c.assessment === 'pasa'
                        ? 'Destildar para devolverlo a la etapa Entrevista'
                        : 'Tildar para pasarlo a la etapa Assessment'
                    }
                  />
                </td>
                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={c.assessment === 'no_pasa'}
                    disabled={cambiando === c.id}
                    onChange={() => toggle(c, 'no_pasa')}
                    className="w-5 h-5 accent-red-600 cursor-pointer"
                    title={
                      c.assessment === 'no_pasa'
                        ? 'Destildar para devolverlo a la etapa Entrevista'
                        : 'Tildar para marcarlo como rechazado'
                    }
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
        * criterios prioritarios · puntajes 1-5 combinando CV + entrevista (la entrevista ajusta los
        puntajes sola al analizarse; también podés retocarlos en la página del candidato) · clic en
        una fila para ver sus respuestas al ejercicio · tildá &quot;Pasa a Assessment&quot; o
        &quot;No sigue&quot; para mover al candidato de etapa (son excluyentes)
      </p>

      {seleccionado && (
        <div className="border-t border-gray-200">
          <div className="flex items-center justify-between px-4 pt-3">
            <h3 className="font-semibold text-gray-900 text-sm">
              Ejercicio de {seleccionado.nombre} — preguntas y respuestas
            </h3>
            <button
              onClick={() => setVerRespuestasDe(null)}
              className="text-xs text-gray-400 hover:text-gray-600 px-2"
            >
              ✕ cerrar
            </button>
          </div>
          {qaDe(seleccionado).length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-4">
              Sin entrevista analizada todavía — las respuestas aparecen cuando se procesa el video.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left px-4 py-2 w-1/3">Pregunta</th>
                  <th className="text-left px-4 py-2">Respuesta (resumen de la transcripción)</th>
                </tr>
              </thead>
              <tbody>
                {qaDe(seleccionado).map((qa, i) => (
                  <tr key={i} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{qa.pregunta}</td>
                    <td className="px-4 py-2.5 text-gray-600">{qa.respuesta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
