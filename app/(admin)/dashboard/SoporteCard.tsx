'use client'

import { useState, useEffect } from 'react'
import { getReclamosSoporte, type ReclamosSoporte } from '@/lib/actions/soporte-reclamos'

export default function SoporteCard() {
  const [data, setData] = useState<ReclamosSoporte | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function cargar(forzar = false) {
    setLoading(true)
    setError(null)
    try {
      const res = await getReclamosSoporte(forzar)
      if (res.error) setError(res.error)
      else setData(res.data ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  const max = data?.categorias[0]?.cantidad ?? 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-gray-900">Soporte — Top reclamos de clientes</h2>
        <button
          onClick={() => cargar(true)}
          disabled={loading}
          className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Analizando...' : 'Actualizar'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Mails de soporte Knox/Trustonic de los últimos {data?.dias ?? 30} días
        {data ? ` — ${data.total} reclamos` : ''}
      </p>

      {loading && !data && (
        <p className="text-sm text-gray-400 py-6 text-center">Analizando mails de soporte...</p>
      )}

      {error && !data && (
        <p className="text-xs text-red-600 py-4">{error}</p>
      )}

      {data && data.categorias.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">Sin reclamos en el período</p>
      )}

      {data && data.categorias.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {data.categorias.map((c, i) => (
            <div key={c.categoria}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-gray-800 truncate">
                  <span className="text-gray-400 font-normal mr-1.5">{i + 1}.</span>
                  {c.categoria}
                </p>
                <p className="text-sm font-bold text-gray-900 tabular-nums shrink-0">
                  {c.cantidad}
                  <span className="text-xs font-normal text-gray-400 ml-1">
                    ({data.total > 0 ? Math.round((c.cantidad / data.total) * 100) : 0}%)
                  </span>
                </p>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-magenta-600 rounded-full"
                  style={{ width: `${Math.max(4, (c.cantidad / max) * 100)}%` }}
                />
              </div>
              {c.ejemplos.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-1 truncate" title={c.ejemplos.join(' — ')}>
                  “{c.ejemplos[0]}”
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {data && (data.otros > 0 || data.sinComentario > 0) && (
        <p className="text-[11px] text-gray-400 mt-4 pt-3 border-t border-gray-100">
          Fuera del ranking: {data.otros} sin patrón claro (Otros) y {data.sinComentario} sin comentario del cliente.
        </p>
      )}
    </div>
  )
}
