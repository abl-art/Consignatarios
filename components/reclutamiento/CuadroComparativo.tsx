'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { setAssessment, type BusquedaCompleta, type CandidatoRow } from '@/lib/actions/reclutamiento'
import type { Assessment } from '@/lib/reclutamiento'

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

const ASSESS_CICLO: Assessment[] = ['pendiente', 'pasa', 'no_pasa']
const ASSESS_UI: Record<Assessment, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-gray-100 text-gray-600 border-transparent' },
  pasa: { texto: '✓ Pasa', clase: 'bg-green-100 text-green-800 border-green-600' },
  no_pasa: { texto: '✗ No pasa', clase: 'bg-red-100 text-red-700 border-red-600' },
}

export default function CuadroComparativo({ busqueda }: { busqueda: BusquedaCompleta }) {
  const router = useRouter()
  const [cambiando, setCambiando] = useState<string | null>(null)

  async function ciclarAssessment(c: CandidatoRow) {
    const siguiente = ASSESS_CICLO[(ASSESS_CICLO.indexOf(c.assessment) + 1) % ASSESS_CICLO.length]
    setCambiando(c.id)
    try {
      await setAssessment(c.id, siguiente)
      router.refresh()
    } finally {
      setCambiando(null)
    }
  }

  const total = (c: CandidatoRow) => Object.values(c.scores).reduce((a, b) => a + b, 0)
  const maxTotal = busqueda.criterios.length * 5

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
      <table className="w-full text-sm min-w-[1000px]">
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
            <th className="px-2 py-3">Assessment</th>
            <th className="px-2 py-3">Arquetipo</th>
          </tr>
        </thead>
        <tbody>
          {busqueda.candidatos.map((c) => {
            const ent = badgeEntrevista(c)
            const ass = ASSESS_UI[c.assessment]
            return (
              <tr key={c.id} className="border-t border-gray-100 text-center">
                <td className="text-left px-4 py-2.5 font-semibold">
                  <Link href={`/reclutamiento/${busqueda.id}/${c.id}`} className="text-indigo-700 hover:underline">
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
                <td className="px-2 py-2.5">
                  <button
                    onClick={() => ciclarAssessment(c)}
                    disabled={cambiando === c.id}
                    className={`text-xs font-bold rounded-full px-3 py-1 border ${ass.clase} disabled:opacity-50`}
                    title="Clic para cambiar: Pendiente → Pasa → No pasa"
                  >
                    {cambiando === c.id ? '…' : ass.texto}
                  </button>
                </td>
                <td className="px-2 py-2.5 text-gray-600">{c.arquetipo || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
        * criterios prioritarios · puntajes 1-5 generados por IA desde CV + entrevista, editables en la
        página de cada candidato · la columna Assessment marca quién pasa a la etapa siguiente
      </p>
    </div>
  )
}
