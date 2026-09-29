'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Registra una entrevista pegando el link PRIVADO de Drive (compartido con el
// service account). Dispara la transcripción + análisis automáticos.
export default function NuevaEntrevista({ candidatoId }: { candidatoId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [link, setLink] = useState('')
  const [titulo, setTitulo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    if (!link.trim()) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/reclutamiento/entrevista', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidato_id: candidatoId, drive_link: link.trim(), titulo: titulo.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setAbierto(false)
      setLink('')
      setTitulo('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      router.refresh() // la fila queda creada en estado error, que se vea
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800"
      >
        + Entrevista (link de Drive)
      </button>
    )
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 w-full md:w-[28rem]">
      <input
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
        placeholder="Link de Drive del video (privado, compartido con el service account)"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <input
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
        placeholder="Título (opcional, ej: Caso práctico)"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
      />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex gap-2 items-center">
        <button
          onClick={enviar}
          disabled={enviando || !link.trim()}
          className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {enviando ? 'Subiendo a transcribir…' : 'Transcribir y analizar'}
        </button>
        <button onClick={() => setAbierto(false)} className="text-sm text-gray-500 px-2">
          Cancelar
        </button>
      </div>
      {enviando && (
        <p className="text-xs text-gray-400 mt-2">
          Enviando el video a transcripción (puede tardar unos minutos si es pesado) — no cierres esta página
        </p>
      )}
    </div>
  )
}
