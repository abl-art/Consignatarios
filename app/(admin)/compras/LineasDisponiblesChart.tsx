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

function fmtCorto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtFecha(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function LineasDisponiblesChart({ lineas, lastSync }: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [open, setOpen] = useState(false)

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
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      })()
    : null

  return (
    <div className="mt-8 bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header — clickable to toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Líneas disponibles</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {syncLabel && <span>Última sync: {syncLabel}</span>}
          <span
            onClick={(e) => { e.stopPropagation(); handleSync() }}
            className={`p-1 rounded hover:bg-gray-200 transition-colors ${syncing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
            title="Sincronizar cheques"
          >
            <svg className={`w-4 h-4 text-gray-500 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Proveedores — collapsible */}
      {open && <div className="divide-y divide-gray-100 border-t border-gray-200">
        {lineas.filter(l => l.limite > 0).map(linea => {
          // Build timeline points: start with disponible hoy, then add each cheque vencimiento
          const grouped: Record<string, number> = {}
          for (const ch of linea.cheques) {
            grouped[ch.fecha_pago] = (grouped[ch.fecha_pago] || 0) + ch.importe
          }

          const puntos: { fecha: string; label: string; disponible: number; liberado: number }[] = []
          // Sort dates
          const fechas = Object.keys(grouped).sort()

          let acumulado = linea.disponible
          // Starting point: today
          puntos.push({ fecha: 'hoy', label: 'Hoy', disponible: acumulado, liberado: 0 })

          for (const f of fechas) {
            acumulado += grouped[f]
            puntos.push({
              fecha: f,
              label: fmtFecha(f),
              disponible: acumulado,
              liberado: grouped[f],
            })
          }

          // SVG line chart dimensions
          const svgW = 600
          const svgH = 60
          const padL = 0
          const padR = 0
          const usableW = svgW - padL - padR

          const maxDisp = Math.max(...puntos.map(p => p.disponible), linea.limite)
          const minDisp = Math.min(...puntos.map(p => p.disponible), 0)
          const range = maxDisp - minDisp || 1

          function xPos(i: number): number {
            if (puntos.length <= 1) return padL + usableW / 2
            return padL + (i / (puntos.length - 1)) * usableW
          }
          function yPos(val: number): number {
            return svgH - 8 - ((val - minDisp) / range) * (svgH - 16)
          }

          // Build SVG path (step line)
          let path = ''
          for (let i = 0; i < puntos.length; i++) {
            const x = xPos(i)
            const y = yPos(puntos[i].disponible)
            if (i === 0) {
              path += `M ${x} ${y}`
            } else {
              // Step: horizontal then vertical
              path += ` L ${x} ${yPos(puntos[i - 1].disponible)} L ${x} ${y}`
            }
          }

          // Limite line y position
          const limiteY = yPos(linea.limite)

          return (
            <div key={linea.id} className="px-5 py-4">
              {/* Proveedor name + disponible */}
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">{linea.nombre}</span>
                <span className="text-sm text-gray-500">
                  Disponible: <span className="font-semibold text-gray-900">{formatearMoneda(linea.disponible)}</span>
                  <span className="text-gray-400 ml-1">/ {formatearMoneda(linea.limite)}</span>
                </span>
              </div>

              {/* Timeline chart */}
              <div className="relative">
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-16" preserveAspectRatio="none">
                  {/* Limite reference line (dashed) */}
                  <line
                    x1={0} y1={limiteY} x2={svgW} y2={limiteY}
                    stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 3"
                  />

                  {/* Step line */}
                  <path d={path} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" />

                  {/* Points */}
                  {puntos.map((p, i) => (
                    <circle
                      key={i}
                      cx={xPos(i)}
                      cy={yPos(p.disponible)}
                      r="4"
                      fill={i === 0 ? '#6366f1' : '#818cf8'}
                      stroke="white"
                      strokeWidth="1.5"
                    />
                  ))}
                </svg>

                {/* Labels below the chart */}
                <div className="flex justify-between mt-1" style={{ paddingLeft: 0, paddingRight: 0 }}>
                  {puntos.map((p, i) => (
                    <div key={i} className="flex flex-col items-center" style={{ width: puntos.length <= 1 ? '100%' : undefined }}>
                      <span className="text-[10px] font-medium text-indigo-600">{fmtCorto(p.disponible)}</span>
                      <span className="text-[9px] text-gray-400">{p.label}</span>
                      {p.liberado > 0 && (
                        <span className="text-[9px] text-green-600">+{fmtCorto(p.liberado)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>}
    </div>
  )
}
