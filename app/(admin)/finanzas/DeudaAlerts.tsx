'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { crearPrestamo } from '@/lib/actions/deuda'
import type { DeudaAlerta } from '@/lib/types'

export default function DeudaAlerts({ alertas }: { alertas: DeudaAlerta[] }) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [accepting, setAccepting] = useState(false)

  function dismiss(idx: number) {
    setDismissed(prev => new Set(prev).add(idx))
  }

  async function aceptarBullet(alerta: DeudaAlerta, idx: number) {
    if (!alerta.monto || !alerta.plazo_sugerido || !alerta.tasa) return
    setAccepting(true)
    await crearPrestamo({
      tipo: 'bullet',
      monto_capital: alerta.monto,
      tasa_anual: alerta.tasa,
      fecha_toma: new Date().toISOString().slice(0, 10),
      plazo_dias: alerta.plazo_sugerido,
    })
    dismiss(idx)
    setAccepting(false)
    router.refresh()
  }

  // Alerta de límite como banner (siempre visible si existe)
  const limiteAlerta = alertas.find(a => a.tipo === 'limite')

  // Pop-ups pendientes
  const popups = alertas
    .map((a, i) => ({ alerta: a, idx: i }))
    .filter(({ alerta, idx }) => !dismissed.has(idx) && (alerta.tipo === 'descubierto' || alerta.tipo === 'sugerencia_bullet'))

  const currentPopup = popups[0]

  return (
    <>
      {/* Banner de límite */}
      {limiteAlerta && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-sm text-red-700">
            Uso de línea al <strong>{limiteAlerta.uso_porcentaje}%</strong> ({formatearMoneda(limiteAlerta.monto ?? 0)} / {formatearMoneda(1000000000)})
          </span>
        </div>
      )}

      {/* Pop-up modal */}
      {currentPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-6 w-full max-w-md">
            {currentPopup.alerta.tipo === 'descubierto' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Descubierto automático</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Se tomó descubierto por <strong>{formatearMoneda(currentPopup.alerta.monto ?? 0)}</strong> del{' '}
                  {currentPopup.alerta.fecha_desde} al {currentPopup.alerta.fecha_hasta}.
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Costo estimado: <strong>{formatearMoneda(currentPopup.alerta.costo_diario ?? 0)}/día</strong> ({((currentPopup.alerta.tasa ?? 0) * 100).toFixed(1)}% TNA)
                </p>
                <div className="text-right">
                  <button
                    onClick={() => dismiss(currentPopup.idx)}
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Entendido
                  </button>
                </div>
              </>
            )}

            {currentPopup.alerta.tipo === 'sugerencia_bullet' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Sugerencia de préstamo Bullet</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Déficit proyectado de <strong>{formatearMoneda(currentPopup.alerta.monto ?? 0)}</strong> por ~{currentPopup.alerta.dias} días (desde {currentPopup.alerta.fecha_desde}).
                </p>
                <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Monto</span>
                    <span className="font-medium">{formatearMoneda(currentPopup.alerta.monto ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Plazo</span>
                    <span className="font-medium">{currentPopup.alerta.plazo_sugerido} días</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tasa TNA</span>
                    <span className="font-medium">{((currentPopup.alerta.tasa ?? 0) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                    <span className="text-gray-500">Interés mensual estimado</span>
                    <span className="font-bold text-red-600">{formatearMoneda(currentPopup.alerta.interes_mensual ?? 0)}</span>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => dismiss(currentPopup.idx)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => aceptarBullet(currentPopup.alerta, currentPopup.idx)}
                    disabled={accepting}
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {accepting ? 'Creando...' : 'Aceptar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
