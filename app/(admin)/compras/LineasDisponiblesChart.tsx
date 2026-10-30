'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { triggerSyncCheques } from '@/lib/actions/compras'
import { formatearMoneda } from '@/lib/utils'
import { armarLiberaciones } from '@/lib/lineas-proveedor'

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
          const liberaciones = armarLiberaciones(linea.disponible, linea.cheques)
          const sobregirada = linea.disponible < 0
          const pctDisponible = Math.max(0, Math.min(100, (linea.disponible / linea.limite) * 100))

          return (
            <div key={linea.id} className="px-5 py-4">
              {/* Proveedor + disponible / límite */}
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-gray-900">{linea.nombre}</span>
                <span className="text-sm text-gray-500 whitespace-nowrap">
                  Disponible:{' '}
                  <span className={`font-semibold ${sobregirada ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatearMoneda(linea.disponible)}
                  </span>
                  <span className="text-gray-400 ml-1">/ {formatearMoneda(linea.limite)}</span>
                </span>
              </div>

              {/* Barra de uso de la línea */}
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${sobregirada ? 'bg-red-400' : 'bg-indigo-500'}`}
                  style={{ width: `${sobregirada ? 100 : pctDisponible}%` }}
                />
              </div>

              {/* Cronograma de liberación — fechas una al lado de la otra */}
              <div className="mt-3 flex items-stretch gap-2 overflow-x-auto pb-1">
                <div className={`flex-none rounded-lg px-3 py-1.5 text-center border ${sobregirada ? 'border-red-200 bg-red-50' : 'border-indigo-200 bg-indigo-50'}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide ${sobregirada ? 'text-red-500' : 'text-indigo-500'}`}>Hoy</div>
                  <div className="text-[11px] leading-4 text-transparent select-none">·</div>
                  <div className={`text-sm font-semibold ${sobregirada ? 'text-red-700' : 'text-indigo-700'}`}>{fmtCorto(linea.disponible)}</div>
                </div>

                {liberaciones.map(lib => (
                  <div key={lib.fecha} className="flex-none rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-1.5 text-center">
                    <div className="text-[10px] font-medium text-gray-400">{fmtFecha(lib.fecha)}</div>
                    <div className="text-[11px] leading-4 font-medium text-green-600">+{fmtCorto(lib.liberado)}</div>
                    <div className={`text-sm font-semibold ${lib.acumulado < 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmtCorto(lib.acumulado)}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>}
    </div>
  )
}
