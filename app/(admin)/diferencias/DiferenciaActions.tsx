'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarEstadoDiferencia } from '@/lib/actions/diferencias'
import type { EstadoDiferencia } from '@/lib/types'

interface DiferenciaActionsProps {
  id: string
  estado: EstadoDiferencia
}

export default function DiferenciaActions({ id, estado }: DiferenciaActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (estado !== 'pendiente') return null

  async function handleUpdate(nuevoEstado: EstadoDiferencia) {
    setLoading(true)
    try {
      const result = await actualizarEstadoDiferencia(id, nuevoEstado)
      if ('error' in result) {
        console.error(result.error)
      } else {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleUpdate('cobrado')}
        disabled={loading}
        className="px-3 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Cobrado
      </button>
      <button
        onClick={() => handleUpdate('resuelto')}
        disabled={loading}
        className="px-3 py-1 text-xs font-medium rounded-md bg-magenta-100 text-magenta-700 hover:bg-magenta-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Resuelto
      </button>
    </div>
  )
}
