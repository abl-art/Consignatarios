'use client'

import { useState } from 'react'
import type { CatalogoAgrupado } from '@/lib/catalogo-buscador'

// Knox Guard aplica al 100% de los Samsung: la marca entera está habilitada
const MARCAS_COMPLETAS: Record<string, string> = {
  Samsung: 'Cualquier teléfono Samsung se puede vender con GOcelular.',
}

export default function BuscadorCatalogo({ catalogo }: { catalogo: CatalogoAgrupado }) {
  const [marca, setMarca] = useState<string | null>(null)

  if (catalogo.modelos.length === 0) {
    return <p className="text-sm text-gray-500">El catálogo no está disponible en este momento. Probá de nuevo en unos minutos.</p>
  }

  const mensajeMarca = marca ? MARCAS_COMPLETAS[marca] : undefined
  const visibles = marca ? catalogo.modelos.filter(m => m.marca === marca) : catalogo.modelos

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setMarca(null)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            marca === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          Todas
        </button>
        {catalogo.marcas.map(m => (
          <button
            key={m}
            onClick={() => setMarca(m)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              marca === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mensajeMarca ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-base text-green-800 font-semibold">✓ {mensajeMarca}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {visibles.map(m => (
            <div key={`${m.marca}|${m.nombre}`} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-gray-900">{m.nombre}</span>
              <span className="shrink-0 text-xs font-bold text-green-700">✓ Se vende con GOcelular</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
