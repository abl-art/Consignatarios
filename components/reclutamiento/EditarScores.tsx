'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { guardarScores } from '@/lib/actions/reclutamiento'
import type { Criterio } from '@/lib/reclutamiento'

const COLOR: Record<number, string> = {
  5: 'bg-green-800',
  4: 'bg-lime-700',
  3: 'bg-yellow-700',
  2: 'bg-orange-700',
  1: 'bg-red-700',
}

// Muestra los puntajes por criterio; clic en un chip lo cicla 1→5 y guarda.
export default function EditarScores({
  candidatoId,
  criterios,
  scores,
}: {
  candidatoId: string
  criterios: Criterio[]
  scores: Record<string, number>
}) {
  const router = useRouter()
  const [valores, setValores] = useState(scores)
  const [guardando, setGuardando] = useState(false)
  const total = Object.values(valores).reduce((a, b) => a + b, 0)

  async function ciclar(clave: string) {
    const nuevo = { ...valores, [clave]: ((valores[clave] || 0) % 5) + 1 }
    setValores(nuevo)
    setGuardando(true)
    try {
      await guardarScores(candidatoId, nuevo)
      router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {criterios.map((c) => (
        <div key={c.clave} className="text-center">
          <p className="text-[11px] text-gray-500 mb-0.5 max-w-[90px] leading-tight">
            {c.nombre}
            {c.prioritario ? '*' : ''}
          </p>
          <button
            onClick={() => ciclar(c.clave)}
            disabled={guardando}
            title="Clic para ajustar el puntaje"
            className={`w-9 rounded-md text-white text-sm font-bold py-1 ${COLOR[valores[c.clave]] || 'bg-gray-300'} hover:opacity-80`}
          >
            {valores[c.clave] || '—'}
          </button>
        </div>
      ))}
      <div className="text-center">
        <p className="text-[11px] text-gray-500 mb-0.5">Total /{criterios.length * 5}</p>
        <span className="inline-block w-11 rounded-md bg-indigo-700 text-white text-sm font-extrabold py-1">
          {total}
        </span>
      </div>
    </div>
  )
}
