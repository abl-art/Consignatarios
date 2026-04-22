'use client'

import { formatearMoneda } from '@/lib/utils'
import type { DeudaAlerta } from '@/lib/types'

export default function DeudaAlerts({ alertas }: { alertas: DeudaAlerta[] }) {
  const limiteAlerta = alertas.find(a => a.tipo === 'limite')

  if (!limiteAlerta) return null

  return (
    <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
      <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <span className="text-sm text-red-700">
        Uso de línea al <strong>{limiteAlerta.uso_porcentaje}%</strong> ({formatearMoneda(limiteAlerta.monto ?? 0)})
      </span>
    </div>
  )
}
