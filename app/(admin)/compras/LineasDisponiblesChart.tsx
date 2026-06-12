'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { triggerSyncCheques } from '@/lib/actions/compras'
import { formatearMoneda } from '@/lib/utils'

interface Cheque { importe: number; fecha_pago: string }
interface LineaProveedor {
  id: string; nombre: string; cuit: string; limite: number;
  totalPendiente: number; disponible: number; cheques: Cheque[]
}
interface Props { lineas: LineaProveedor[]; lastSync: string | null }

export default function LineasDisponiblesChart({ lineas, lastSync }: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  if (lineas.length === 0) return null

  const handleSync = async () => {
    setSyncing(true)
    try {
      await triggerSyncCheques()
      router.refresh()
    } catch {
      // silently fail
    } finally {
      setSyncing(false)
    }
  }

  const syncLabel = lastSync
    ? (() => {
        const d = new Date(lastSync)
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const hh = String(d.getHours()).padStart(2, '0')
        const min = String(d.getMinutes()).padStart(2, '0')
        return `${dd}/${mm} ${hh}:${min}`
      })()
    : null

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fin = new Date(hoy)
  fin.setDate(fin.getDate() + 90)
  const totalMs = fin.getTime() - hoy.getTime()

  // Month markers within the 90-day window
  const monthMarkers: { label: string; pct: number }[] = []
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  for (let i = 0; i <= 3; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i + 1, 1)
    if (d.getTime() > fin.getTime()) break
    if (d.getTime() <= hoy.getTime()) continue
    const pct = ((d.getTime() - hoy.getTime()) / totalMs) * 100
    monthMarkers.push({ label: monthNames[d.getMonth()], pct })
  }

  return (
    <div className="mt-8 bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Líneas disponibles</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {syncLabel && <span>Última sync: {syncLabel}</span>}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Sincronizar cheques"
          >
            <svg className={`w-4 h-4 text-gray-500 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Proveedores */}
      <div className="divide-y divide-gray-100">
        {lineas.filter(l => l.limite > 0).map(linea => {
          const dispPct = linea.limite > 0 ? Math.round((linea.disponible / linea.limite) * 100) : 0
          const usedPct = 100 - Math.max(0, Math.min(100, dispPct))
          const barColor = dispPct > 50 ? 'bg-green-500' : dispPct >= 20 ? 'bg-yellow-500' : 'bg-red-500'
          const textColor = dispPct > 50 ? 'text-green-600' : dispPct >= 20 ? 'text-yellow-600' : 'text-red-600'

          // Group cheques by fecha_pago
          const grouped: Record<string, number> = {}
          for (const ch of linea.cheques) {
            grouped[ch.fecha_pago] = (grouped[ch.fecha_pago] || 0) + ch.importe
          }
          const dots = Object.entries(grouped).map(([fecha, importe]) => {
            const d = new Date(fecha + 'T00:00:00')
            const pct = Math.max(0, Math.min(100, ((d.getTime() - hoy.getTime()) / totalMs) * 100))
            const dd = String(d.getDate()).padStart(2, '0')
            const mm = String(d.getMonth() + 1).padStart(2, '0')
            return { fecha: `${dd}/${mm}`, importe, pct }
          })

          return (
            <div key={linea.id} className="px-5 py-4">
              {/* Header row */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">{linea.nombre}</span>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`font-semibold ${textColor}`}>{formatearMoneda(linea.disponible)}</span>
                  <span className="text-gray-400">de {formatearMoneda(linea.limite)}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    dispPct > 50 ? 'bg-green-100 text-green-700' :
                    dispPct >= 20 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>{dispPct}%</span>
                </div>
              </div>

              {/* Usage bar */}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${usedPct}%` }} />
              </div>

              {/* Timeline */}
              {dots.length > 0 && (
                <div className="relative h-10 bg-gray-50 rounded border border-gray-100">
                  {/* "hoy" marker */}
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300" />
                  <span className="absolute left-0.5 top-0 text-[9px] text-gray-400">hoy</span>

                  {/* Month markers */}
                  {monthMarkers.map(m => (
                    <div key={m.label} className="absolute top-0 bottom-0" style={{ left: `${m.pct}%` }}>
                      <div className="w-px h-full bg-gray-200" />
                      <span className="absolute -top-0 left-0.5 text-[9px] text-gray-400">{m.label}</span>
                    </div>
                  ))}

                  {/* Cheque dots */}
                  {dots.map((dot, i) => (
                    <div
                      key={i}
                      className="group absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                      style={{ left: `${dot.pct}%` }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white shadow-sm cursor-pointer" />
                      {/* Tooltip */}
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap z-10 shadow-lg">
                        {formatearMoneda(dot.importe)} — {dot.fecha}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
