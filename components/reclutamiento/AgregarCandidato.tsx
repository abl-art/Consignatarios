'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Sube el PDF de LinkedIn y la IA genera la ficha con puntajes.
export default function AgregarCandidato({ busquedaId }: { busquedaId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(file: File) {
    setSubiendo(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('cv', file)
      fd.append('busqueda_id', busquedaId)
      const res = await fetch('/api/reclutamiento/cv', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al analizar el CV')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="shrink-0 text-right">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-60"
      >
        {subiendo ? 'Analizando CV…' : '+ Candidato (PDF de LinkedIn)'}
      </button>
      {subiendo && (
        <p className="text-xs text-gray-400 mt-1">La IA está leyendo el CV, tarda ~30 segundos</p>
      )}
      {error && <p className="text-xs text-red-600 mt-1 max-w-xs">{error}</p>}
    </div>
  )
}
