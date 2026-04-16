'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarEstadoLiquidacion, generarLiquidacionesDelMes } from '@/lib/actions/liquidaciones'
import type { EstadoLiquidacion } from '@/lib/types'

export function RowActions({ id, estado }: { id: string; estado: EstadoLiquidacion }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function cambiar(nuevo: EstadoLiquidacion) {
    setLoading(true)
    await actualizarEstadoLiquidacion(id, nuevo)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="flex gap-1">
      {estado === 'bloqueada' && (
        <button onClick={() => cambiar('pendiente')} disabled={loading}
          className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 disabled:opacity-50">
          Desbloquear
        </button>
      )}
      {estado === 'pendiente' && (
        <button onClick={() => cambiar('pagada')} disabled={loading}
          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50">
          Marcar pagada
        </button>
      )}
    </div>
  )
}

export function GenerarButton({ mes }: { mes: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function generar() {
    setLoading(true)
    const r = await generarLiquidacionesDelMes(mes)
    setLoading(false)
    if ('error' in r && r.error) setMsg(`Error: ${r.error}`)
    else if ('creadas' in r) setMsg(`${r.creadas} liquidaciones creadas`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={generar} disabled={loading}
        className="px-4 py-2 text-sm bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 disabled:opacity-50">
        {loading ? 'Generando...' : `Generar liquidaciones de ${mes}`}
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  )
}
