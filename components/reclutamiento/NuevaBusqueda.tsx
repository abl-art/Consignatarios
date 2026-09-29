'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearBusqueda } from '@/lib/actions/reclutamiento'

export default function NuevaBusqueda() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [mandato, setMandato] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      const id = await crearBusqueda(nombre.trim(), mandato.trim())
      router.push(`/reclutamiento/${id}`)
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 shrink-0"
      >
        + Nueva búsqueda
      </button>
    )
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 w-full md:w-96 shrink-0">
      <input
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
        placeholder="Nombre del puesto (ej: Business Owner GOmarket)"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <textarea
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
        rows={3}
        placeholder="Mandato / objetivo del rol (lo usa la IA para evaluar candidatos)"
        value={mandato}
        onChange={(e) => setMandato(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={guardar}
          disabled={guardando || !nombre.trim()}
          className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {guardando ? 'Creando…' : 'Crear'}
        </button>
        <button onClick={() => setAbierto(false)} className="text-sm text-gray-500 px-2">
          Cancelar
        </button>
      </div>
    </div>
  )
}
