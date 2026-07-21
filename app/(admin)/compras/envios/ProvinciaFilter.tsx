'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ProvinciaFilter({ provincias, actual }: { provincias: string[]; actual?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(actual || '')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query
    ? provincias.filter(p => p.toLowerCase().includes(query.toLowerCase()))
    : provincias

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'costos')
    if (value) {
      params.set('provincia', value)
    } else {
      params.delete('provincia')
    }
    setQuery(value)
    setOpen(false)
    router.push(`/compras/envios?${params.toString()}`)
  }

  return (
    <div ref={ref} className="relative w-64">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar ciudad..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
      />
      {query && actual && (
        <button
          onClick={() => select('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
        >
          ✕
        </button>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {!actual && (
            <button
              onClick={() => select('')}
              className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              Todas las ciudades
            </button>
          )}
          {filtered.map(p => (
            <button
              key={p}
              onClick={() => select(p)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                p === actual ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
