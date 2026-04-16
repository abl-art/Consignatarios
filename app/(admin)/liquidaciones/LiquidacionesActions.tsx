'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  actualizarEstadoLiquidacion,
  confirmarLiquidacion,
  eliminarLiquidacion,
  generarBorradorLiquidacion,
} from '@/lib/actions/liquidaciones'
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

  async function confirmar() {
    setLoading(true)
    await confirmarLiquidacion(id)
    setLoading(false)
    router.refresh()
  }

  async function eliminar() {
    if (!confirm('¿Eliminar este borrador?')) return
    setLoading(true)
    await eliminarLiquidacion(id)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="flex gap-1">
      {estado === 'borrador' && (
        <>
          <button onClick={confirmar} disabled={loading}
            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50">
            Confirmar
          </button>
          <button onClick={eliminar} disabled={loading}
            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50">
            Eliminar
          </button>
        </>
      )}
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

export function GenerarButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
  const defaultInicio = prevMonth.toISOString().slice(0, 10)
  const defaultFin = lastDay.toISOString().slice(0, 10)

  const [inicio, setInicio] = useState(defaultInicio)
  const [fin, setFin] = useState(defaultFin)

  async function generar() {
    if (!inicio || !fin || inicio > fin) {
      setMsg('Fecha inicio debe ser anterior a fecha fin')
      return
    }
    setLoading(true)
    setMsg(null)
    const r = await generarBorradorLiquidacion({ fechaInicio: inicio, fechaFin: fin })
    setLoading(false)
    if ('error' in r && r.error) setMsg(`Error: ${r.error}`)
    else if ('ok' in r) {
      if (r.creadas === 0) setMsg('Sin ventas en ese período')
      else setMsg(`${r.creadas} borradores creados`)
    }
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Generar borrador de liquidación</h3>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={generar} disabled={loading}
          className="px-5 py-2 bg-magenta-600 text-white text-sm font-semibold rounded-lg hover:bg-magenta-700 disabled:opacity-50">
          {loading ? 'Generando...' : 'Generar borrador'}
        </button>
        {msg && <span className="text-sm text-gray-700">{msg}</span>}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Se crea un borrador por cada consignatario con ventas en el período. Revisá y confirmá para liquidar.
      </p>
    </div>
  )
}
