'use client'

import { useState } from 'react'
import { buscarModelos, type ModeloCatalogo } from '@/lib/catalogo-buscador'

const BLOQUEOS: Record<string, string> = {
  motosafe: 'MotoSafe',
  knox_guard: 'Knox Guard',
  xiaomi: 'Xiaomi Lock',
}

export default function BuscadorCatalogo({ modelos }: { modelos: ModeloCatalogo[] }) {
  const [consulta, setConsulta] = useState('')
  const resultados = buscarModelos(consulta, modelos)

  if (modelos.length === 0) {
    return <p className="text-sm text-gray-500">El catálogo no está disponible en este momento. Probá de nuevo en unos minutos.</p>
  }

  return (
    <div>
      <input
        type="search"
        value={consulta}
        onChange={e => setConsulta(e.target.value)}
        placeholder='Buscar modelo… ej: "a17 128", "moto g06", "redmi 14c"'
        autoFocus
        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 mb-2"
      />
      <p className="text-xs text-gray-400 mb-4">
        {consulta.trim()
          ? `${resultados.length} ${resultados.length === 1 ? 'modelo' : 'modelos'} para “${consulta.trim()}”`
          : `${modelos.length} modelos en el catálogo`}
      </p>

      {resultados.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm text-amber-800 font-medium">Ese modelo no está en el catálogo de GOcelular.</p>
          <p className="text-xs text-amber-700 mt-1">Si creés que debería estar, consultá con el equipo de GOcelular.</p>
        </div>
      )}

      <div className="space-y-3">
        {resultados.map(m => (
          <div key={m.modelCode} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{m.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {m.marca} · <span className="font-mono">{m.modelCode}</span>
                </p>
              </div>
              <span className="shrink-0 inline-flex px-2.5 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">
                ✓ Se vende con GOcelular
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3 text-xs">
              {m.lockSolution && (
                <span className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">
                  🔒 {BLOQUEOS[m.lockSolution] ?? m.lockSolution}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">
                📱 {m.dispositivos.toLocaleString('es-AR')} equipos registrados
              </span>
              {!m.activo && (
                <span className="px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                  Inactivo en catálogo
                </span>
              )}
            </div>
            {m.alias.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                También conocido como: {m.alias.join(' · ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
