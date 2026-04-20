'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { devolverEquipo } from '@/lib/actions/asignar'

interface Asignado {
  id: string
  imei: string
  estado: string
  fecha_asignacion: string | null
  consignatario_id: string
  consignatarios: { nombre: string } | null
  modelos: { marca: string; modelo: string } | null
}

interface Devuelto {
  id: string
  imei: string
  estado: string
  fecha_asignacion: string | null
  created_at: string
  modelos: { marca: string; modelo: string } | null
  consignatarioNombre?: string
}

interface DevolucionPendiente {
  dispositivo: Asignado
  timestamp: string
}

export default function DevolucionesClient({
  asignados,
  devueltos,
}: {
  asignados: Asignado[]
  devueltos: Devuelto[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [imeiInput, setImeiInput] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null)
  const [pendientes, setPendientes] = useState<DevolucionPendiente[]>([])
  const [processing, setProcessing] = useState(false)
  const [tab, setTab] = useState<'devolver' | 'historial'>('devolver')

  const handleImeiSubmit = useCallback(() => {
    const imei = imeiInput.trim().replace(/\s+/g, '').replace(/\D/g, '')
    if (!imei) return

    // Check if already in pendientes
    if (pendientes.some(p => p.dispositivo.imei === imei)) {
      setFeedback({ type: 'warning', message: `IMEI ${imei} ya está en la lista de devolución` })
      setImeiInput('')
      setTimeout(() => setFeedback(null), 2000)
      return
    }

    // Find in asignados
    const found = asignados.find(d => d.imei === imei)
    if (!found) {
      setFeedback({ type: 'error', message: `IMEI ${imei} no encontrado o no está asignado` })
      setImeiInput('')
      setTimeout(() => setFeedback(null), 3000)
      return
    }

    setPendientes(prev => [...prev, { dispositivo: found, timestamp: new Date().toISOString() }])
    setFeedback({ type: 'success', message: `${found.modelos?.marca} ${found.modelos?.modelo} — ${found.consignatarios?.nombre}` })
    setImeiInput('')
    setTimeout(() => setFeedback(null), 2000)
    inputRef.current?.focus()
  }, [imeiInput, asignados, pendientes])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleImeiSubmit()
    }
  }, [handleImeiSubmit])

  const removePendiente = (imei: string) => {
    setPendientes(prev => prev.filter(p => p.dispositivo.imei !== imei))
  }

  async function confirmarDevoluciones() {
    if (pendientes.length === 0) return
    setProcessing(true)

    for (const p of pendientes) {
      await devolverEquipo(p.dispositivo.id)
    }

    setPendientes([])
    setProcessing(false)
    setFeedback({ type: 'success', message: `${pendientes.length} equipo${pendientes.length !== 1 ? 's' : ''} devuelto${pendientes.length !== 1 ? 's' : ''} al stock` })
    setTimeout(() => setFeedback(null), 3000)
    router.refresh()
  }

  // Group pendientes by consignatario
  const pendientesPorConsig: Record<string, DevolucionPendiente[]> = {}
  pendientes.forEach(p => {
    const nombre = p.dispositivo.consignatarios?.nombre || 'Sin consignatario'
    if (!pendientesPorConsig[nombre]) pendientesPorConsig[nombre] = []
    pendientesPorConsig[nombre].push(p)
  })

  const tabs = [
    { key: 'devolver' as const, label: `Devolver (${pendientes.length})` },
    { key: 'historial' as const, label: `Historial (${devueltos.length})` },
  ]

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-magenta-600 text-magenta-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'devolver' && (
        <div className="space-y-6">
          {/* IMEI Scanner input */}
          <div className="bg-white border-2 border-orange-200 rounded-xl p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Escanear IMEI para devolver</label>
            <p className="text-xs text-gray-500 mb-3">Usá la pistola lectora o ingresá el IMEI manualmente</p>
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={imeiInput}
                onChange={(e) => setImeiInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escanear o ingresar IMEI..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-lg font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                autoComplete="off"
                autoFocus
              />
              <button
                type="button"
                onClick={handleImeiSubmit}
                className="px-6 py-3 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors"
              >
                Agregar
              </button>
            </div>
            {feedback && (
              <div className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
                feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200'
                : feedback.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {feedback.message}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 text-center">
            <p className="text-xs text-gray-500 mb-1">Equipos a devolver</p>
            <p className="text-3xl font-bold text-orange-700">{pendientes.length}</p>
            <p className="text-xs text-gray-500">{asignados.length} equipos asignados en total</p>
          </div>

          {/* Pendientes list grouped by consignatario */}
          {pendientes.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="text-gray-400 text-sm">Escaneá IMEIs para armar la lista de devolución</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(pendientesPorConsig).map(([consigNombre, items]) => (
                <div key={consigNombre} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                    <span className="font-semibold text-gray-900">{consigNombre}</span>
                    <span className="text-xs text-gray-500">{items.length} equipo{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map(p => (
                      <div key={p.dispositivo.imei} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-sm text-gray-700">{p.dispositivo.imei}</span>
                          <span className="text-xs text-gray-500 ml-3">{p.dispositivo.modelos?.marca} {p.dispositivo.modelos?.modelo}</span>
                        </div>
                        <button
                          onClick={() => removePendiente(p.dispositivo.imei)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button
                onClick={confirmarDevoluciones}
                disabled={processing}
                className="w-full py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 disabled:opacity-40 transition-colors"
              >
                {processing ? 'Procesando...' : `Confirmar devolución de ${pendientes.length} equipo${pendientes.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'historial' && (
        <HistorialDevoluciones devueltos={devueltos} />
      )}
    </div>
  )
}

function HistorialDevoluciones({ devueltos }: { devueltos: Devuelto[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (devueltos.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <p className="text-gray-400 text-sm">No hay devoluciones registradas</p>
      </div>
    )
  }

  // Group by date + consignatario
  const byGroup: Record<string, Devuelto[]> = {}
  devueltos.forEach(d => {
    const fecha = new Date(d.created_at).toLocaleDateString('es-AR')
    const consig = d.consignatarioNombre || 'Sin consignatario'
    const key = `${fecha}|${consig}`
    if (!byGroup[key]) byGroup[key] = []
    byGroup[key].push(d)
  })

  return (
    <div className="space-y-3">
      {Object.entries(byGroup).map(([key, items]) => {
        const [fecha, consig] = key.split('|')
        const isExpanded = expanded === key
        const byModel: Record<string, number> = {}
        items.forEach(d => {
          const name = d.modelos ? `${d.modelos.marca} ${d.modelos.modelo}` : 'Desconocido'
          byModel[name] = (byModel[name] || 0) + 1
        })
        const modelSummary = Object.entries(byModel).map(([m, c]) => `${c}x ${m}`).join(', ')

        return (
          <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(isExpanded ? null : key)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-400">{isExpanded ? '▾' : '▸'}</span>
                <div>
                  <span className="font-semibold text-gray-900">{fecha}</span>
                  <span className="text-xs text-gray-500 mx-2">·</span>
                  <span className="text-sm text-gray-700">{consig}</span>
                  <span className="text-xs text-gray-400 ml-3">{modelSummary}</span>
                </div>
              </div>
              <span className="text-sm font-bold text-orange-700">{items.length} equipo{items.length !== 1 ? 's' : ''}</span>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {items.map(d => (
                  <div key={d.id} className="px-5 py-2 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      <span className="font-mono text-xs text-gray-700">{d.imei}</span>
                    </div>
                    <span className="text-xs text-gray-500">{d.modelos?.marca} {d.modelos?.modelo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
