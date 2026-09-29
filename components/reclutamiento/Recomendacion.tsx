'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Recomendacion({
  busquedaId,
  recomendacion,
  recomendacionAt,
}: {
  busquedaId: string
  recomendacion: string | null
  recomendacionAt: string | null
}) {
  const router = useRouter()
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function regenerar() {
    setGenerando(true)
    setError(null)
    try {
      const res = await fetch('/api/reclutamiento/recomendacion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ busqueda_id: busquedaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900">Recomendación del reclutador IA</h2>
        <button
          onClick={regenerar}
          disabled={generando}
          className="bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-60"
        >
          {generando ? 'Generando…' : recomendacion ? 'Regenerar' : 'Generar'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {recomendacion ? (
        <>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{recomendacion}</div>
          {recomendacionAt && (
            <p className="text-xs text-gray-400 mt-3">
              Generada el {new Date(recomendacionAt).toLocaleString('es-AR')} — regenerala cuando sumes
              candidatos o entrevistas
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-400">
          Todavía no hay recomendación. Generala cuando tengas al menos un par de candidatos cargados.
        </p>
      )}
    </div>
  )
}
