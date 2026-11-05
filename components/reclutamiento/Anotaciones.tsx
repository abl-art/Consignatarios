'use client'

import { useRef, useState } from 'react'
import { setAnotaciones } from '@/lib/actions/reclutamiento'

// Anotaciones libres del candidato: lo que Emiliano va sintiendo al ver la
// entrevista y leer los datos. Se guarda solo (debounce al tipear + al salir
// del campo); los llamados se serializan para no pisar un guardado anterior.
export default function Anotaciones({
  candidatoId,
  valor,
}: {
  candidatoId: string
  valor: string | null
}) {
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const colaRef = useRef<Promise<void>>(Promise.resolve())
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const persistir = (texto: string) => {
    setGuardando(true)
    setGuardado(false)
    setError(null)
    colaRef.current = colaRef.current
      .then(() => setAnotaciones(candidatoId, texto))
      .then(() => setGuardado(true))
      .catch(() => setError('No se pudo guardar — reintentá'))
      .finally(() => setGuardando(false))
  }

  const onChange = (texto: string) => {
    setGuardado(false)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => persistir(texto), 1200)
  }

  const onBlur = (texto: string) => {
    clearTimeout(debounceRef.current)
    persistir(texto)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-gray-900">Anotaciones</h2>
        <span className="text-xs text-gray-400">
          {guardando ? 'guardando…' : guardado ? 'guardado ✓' : ''}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-3">
        Lo que vas sintiendo mientras mirás la entrevista y leés los datos: impresiones, dudas, lo que
        te cierra y lo que no. Se guarda solo.
      </p>
      <textarea
        defaultValue={valor ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
        placeholder="Escribí tus impresiones…"
        rows={5}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-y"
      />
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
