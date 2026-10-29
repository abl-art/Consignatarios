'use client'

// Anular orden (reembolso TOTAL por API GOcuotas) desde Rescates y
// Devoluciones: el botón viaja con la línea (decisión de Emiliano 28/10). El
// estado de Pedro es el PISO de habilitación — rescate_confirmado/recibido o
// retiro_realizado/devolucion_recibida —; el momento lo decide Yami.
// Confirmación en dos pasos, como en Arrepentimientos.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { anularOrdenCaso } from '@/lib/actions/anular-orden'
import { puedeAnularOrden } from '@/lib/arrepentimientos'

export default function BotonAnularOrden({
  gocuotasOrderId,
  gocuotasStatus,
  orderNumber,
  rescateEstado,
  devolucionEstado,
}: {
  gocuotasOrderId: string | null
  gocuotasStatus: string | null
  orderNumber: string
  /** Solo pintan el botón — la autorización real la re-consulta la server action contra Pedro */
  rescateEstado?: string | null
  devolucionEstado?: string | null
}) {
  const router = useRouter()
  const [armado, setArmado] = useState(false)
  const [hecho, setHecho] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, startTransition] = useTransition()

  if (!gocuotasOrderId) return null

  const guard = puedeAnularOrden({
    estado: 'pendiente',
    gocuotasOrderId,
    gocuotasStatus,
    fulfillment: 'expedido',
    rescateEstado: rescateEstado ?? null,
    devolucionEstado: devolucionEstado ?? null,
  })

  if (hecho) return <span className="text-[10px] font-semibold text-rose-700">✓ anulada</span>

  const clickear = () => {
    setError(null)
    if (!armado) {
      setArmado(true)
      return
    }
    startTransition(async () => {
      const r = await anularOrdenCaso({ gocuotasOrderId, gocuotasStatus, orderNumber })
      if (r.error) {
        setError(r.error)
        setArmado(false)
        return
      }
      setHecho(true)
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={clickear}
        disabled={!guard.ok || enviando}
        title={guard.ok ? 'Reembolso TOTAL de la orden por API GOcuotas (no se puede deshacer)' : guard.error}
        className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border transition-colors ${
          armado
            ? 'bg-rose-600 text-white border-rose-600'
            : 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 disabled:opacity-40'
        }`}
      >
        {enviando ? '…' : armado ? '¿Reembolsar TOTAL?' : 'Anular orden'}
      </button>
      {armado && !enviando && (
        <button onClick={() => setArmado(false)} className="text-xs text-gray-400 hover:text-gray-600" title="Cancelar">✕</button>
      )}
      {error && <span className="text-[10px] text-red-600 max-w-[160px]">✗ {error}</span>}
    </span>
  )
}
