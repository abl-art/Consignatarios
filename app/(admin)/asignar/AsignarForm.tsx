'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Consignatario, DispositivoConModelo } from '@/lib/types'
import { formatearMoneda, calcularPrecioVenta } from '@/lib/utils'
import { prepararAsignacion } from '@/lib/actions/asignar'

interface AsignarFormProps {
  consignatarios: Consignatario[]
  dispositivos: DispositivoConModelo[]
  multiplicador: number
  compromisoMap: Record<string, number>
}

export default function AsignarForm({ consignatarios, dispositivos, multiplicador, compromisoMap }: AsignarFormProps) {
  const router = useRouter()

  const [consignatarioId, setConsignatarioId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filtroModelo, setFiltroModelo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // IMEI search state
  const [imeiInput, setImeiInput] = useState('')
  const [imeiFeedback, setImeiFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const imeiInputRef = useRef<HTMLInputElement>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear feedback after 2 seconds
  useEffect(() => {
    if (imeiFeedback) {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = setTimeout(() => setImeiFeedback(null), 2000)
    }
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [imeiFeedback])

  // Build a map of IMEI -> dispositivo for fast lookup
  const imeiMap = useMemo(() => {
    const map = new Map<string, DispositivoConModelo>()
    for (const d of dispositivos) {
      map.set(d.imei, d)
    }
    return map
  }, [dispositivos])

  const handleImeiSubmit = useCallback(() => {
    const trimmed = imeiInput.trim()
    if (!trimmed) return

    const device = imeiMap.get(trimmed)
    if (device) {
      if (selected.has(device.id)) {
        setImeiFeedback({ type: 'success', message: `IMEI ya seleccionado` })
      } else {
        setSelected((prev) => {
          const next = new Set(prev)
          next.add(device.id)
          return next
        })
        setImeiFeedback({ type: 'success', message: `IMEI agregado` })
      }
      setImeiInput('')
    } else {
      setImeiFeedback({ type: 'error', message: 'IMEI no encontrado' })
    }

    // Keep focus on input for rapid scanning
    imeiInputRef.current?.focus()
  }, [imeiInput, imeiMap, selected])

  const handleImeiKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleImeiSubmit()
    }
  }, [handleImeiSubmit])

  const dispositivosFiltrados = useMemo(() => {
    if (!filtroModelo.trim()) return dispositivos
    const q = filtroModelo.toLowerCase()
    return dispositivos.filter(
      (d) =>
        d.modelos.marca.toLowerCase().includes(q) ||
        d.modelos.modelo.toLowerCase().includes(q)
    )
  }, [dispositivos, filtroModelo])

  const allVisible = dispositivosFiltrados.length > 0
  const allSelected =
    allVisible && dispositivosFiltrados.every((d) => selected.has(d.id))

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        dispositivosFiltrados.forEach((d) => next.delete(d.id))
      } else {
        dispositivosFiltrados.forEach((d) => next.add(d.id))
      }
      return next
    })
  }, [allSelected, dispositivosFiltrados])

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedDispositivos = useMemo(
    () => dispositivos.filter((d) => selected.has(d.id)),
    [dispositivos, selected]
  )

  const totalValorCosto = useMemo(
    () => selectedDispositivos.reduce((acc, d) => acc + d.modelos.precio_costo, 0),
    [selectedDispositivos]
  )

  const totalValorVenta = useMemo(
    () => selectedDispositivos.reduce((acc, d) => acc + calcularPrecioVenta(d.modelos.precio_costo, multiplicador), 0),
    [selectedDispositivos, multiplicador]
  )

  const selectedConsig = consignatarios.find((c) => c.id === consignatarioId)
  const garantia = selectedConsig?.garantia ?? 0
  const compromisoActual = compromisoMap[consignatarioId] ?? 0
  const excede = garantia > 0 && (compromisoActual + totalValorCosto) > garantia

  const canSubmit =
    consignatarioId !== '' &&
    selected.size > 0 &&
    !submitting &&
    !excede

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    const result = await prepararAsignacion({
      consignatario_id: consignatarioId,
      dispositivos: selectedDispositivos.map(d => ({
        imei: d.imei,
        modelo_id: d.modelo_id,
        marca: d.modelos.marca,
        modelo: d.modelos.modelo,
        precio_costo: d.modelos.precio_costo,
      })),
      total_valor_costo: totalValorCosto,
      total_valor_venta: totalValorVenta,
    })

    if ('error' in result) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    setSuccess(`Borrador creado con ${selected.size} equipos. Pendiente de firma del consignatario.`)
    setSelected(new Set())
    setSubmitting(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Consignatario selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Consignatario
        </label>
        <select
          value={consignatarioId}
          onChange={(e) => setConsignatarioId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500"
          required
        >
          <option value="">Selecciona un consignatario</option>
          {consignatarios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* IMEI Search — prominent input */}
      <div className="bg-white border-2 border-magenta-200 rounded-xl p-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Agregar IMEI
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Escribe o pega un IMEI y presiona Enter para agregarlo a la seleccion
        </p>
        <div className="flex gap-3">
          <input
            ref={imeiInputRef}
            type="text"
            value={imeiInput}
            onChange={(e) => setImeiInput(e.target.value)}
            onKeyDown={handleImeiKeyDown}
            placeholder="Ingresa un IMEI..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-lg font-mono focus:outline-none focus:ring-2 focus:ring-magenta-500 focus:border-magenta-500"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleImeiSubmit}
            className="px-6 py-3 bg-magenta-600 text-white font-medium rounded-lg hover:bg-magenta-700 transition-colors"
          >
            Agregar
          </button>
        </div>
        {imeiFeedback && (
          <div
            className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              imeiFeedback.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {imeiFeedback.message}
          </div>
        )}
      </div>

      {/* Stock summary by model */}
      <StockResumen dispositivos={dispositivos} selected={selected} filtroModelo={filtroModelo} setFiltroModelo={setFiltroModelo} toggleOne={toggleOne} />

      {/* Garantia validation -- only when a consignatario is selected */}
      {consignatarioId && (() => {
        const consig = consignatarios.find((c) => c.id === consignatarioId)
        if (!consig) return null
        const garantiaVal = consig.garantia ?? 0
        const compromisoActualVal = compromisoMap[consignatarioId] ?? 0
        const proyectado = compromisoActualVal + totalValorCosto
        const disponible = garantiaVal - proyectado
        const excedeVal = garantiaVal > 0 && proyectado > garantiaVal
        return (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Garantia</h3>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Garantia</p>
                <p className="font-bold text-gray-900">{formatearMoneda(garantiaVal)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Ya comprometido</p>
                <p className="font-bold text-amber-700">{formatearMoneda(compromisoActualVal)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Esta asignacion</p>
                <p className="font-bold text-magenta-700">{formatearMoneda(totalValorCosto)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Disponible</p>
                <p className={`font-bold ${disponible < 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {formatearMoneda(disponible)}
                </p>
              </div>
            </div>
            {excedeVal && (
              <p className="text-sm text-red-700 mt-3 font-medium">
                Excede la garantia en {formatearMoneda(proyectado - garantiaVal)}
              </p>
            )}
            {garantiaVal === 0 && (
              <p className="text-sm text-amber-700 mt-3">
                Este consignatario no tiene garantia configurada
              </p>
            )}
          </div>
        )
      })()}

      {/* Summary -- only when something is selected */}
      {selected.size > 0 && (
        <div className="bg-magenta-50 border border-magenta-200 rounded-xl p-5 text-center">
          <p className="text-xs text-gray-500 mb-1">Equipos seleccionados</p>
          <p className="text-3xl font-bold text-magenta-700">{selected.size}</p>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-6 py-2.5 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? 'Preparando...'
            : `Preparar borrador (${selected.size} equipo${selected.size !== 1 ? 's' : ''})`}
        </button>
      </div>
    </form>
  )
}

// Stock summary grouped by model with expandable IMEIs
function StockResumen({
  dispositivos,
  selected,
  filtroModelo,
  setFiltroModelo,
  toggleOne,
}: {
  dispositivos: DispositivoConModelo[]
  selected: Set<string>
  filtroModelo: string
  setFiltroModelo: (v: string) => void
  toggleOne: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const map: Record<string, { marca: string; modelo: string; dispositivos: DispositivoConModelo[] }> = {}
    for (const d of dispositivos) {
      const key = `${d.modelos.marca}|${d.modelos.modelo}`
      if (!map[key]) map[key] = { marca: d.modelos.marca, modelo: d.modelos.modelo, dispositivos: [] }
      map[key].dispositivos.push(d)
    }
    let result = Object.values(map).sort((a, b) => b.dispositivos.length - a.dispositivos.length)
    if (filtroModelo.trim()) {
      const q = filtroModelo.toLowerCase()
      result = result.filter(g => g.marca.toLowerCase().includes(q) || g.modelo.toLowerCase().includes(q))
    }
    return result
  }, [dispositivos, filtroModelo])

  // Only show models that have at least one selected device
  const groupsConSeleccion = useMemo(() => {
    return groups.filter(g => g.dispositivos.some(d => selected.has(d.id)))
  }, [groups, selected])

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <span className="text-sm text-gray-500">
          {dispositivos.length} equipos disponibles · {selected.size} seleccionados
        </span>
        <input
          type="text"
          placeholder="Filtrar por modelo..."
          value={filtroModelo}
          onChange={(e) => setFiltroModelo(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500 w-56"
        />
      </div>

      <div className="divide-y divide-gray-100">
        {groupsConSeleccion.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Ingresá IMEIs arriba para ir armando la asignación</div>
        ) : (
          groupsConSeleccion.map(group => {
            const key = `${group.marca}|${group.modelo}`
            const isExpanded = expanded.has(key)
            const selectedCount = group.dispositivos.filter(d => selected.has(d.id)).length

            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggleExpand(key)}
                  className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">{isExpanded ? '▾' : '▸'}</span>
                    <span className="font-medium text-gray-900">{group.marca} {group.modelo}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {selectedCount > 0 && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-magenta-100 text-magenta-700">
                        {selectedCount} seleccionados
                      </span>
                    )}
                    <span className="text-sm text-gray-500">{group.dispositivos.length} u.</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="bg-gray-50 px-6 py-2 space-y-1 border-t border-gray-100">
                    {group.dispositivos.filter(d => selected.has(d.id)).map(d => {
                      return (
                        <div
                          key={d.id}
                          className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-green-50"
                        >
                          <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="font-mono text-xs text-gray-700">{d.imei}</span>
                          <button
                            type="button"
                            onClick={() => toggleOne(d.id)}
                            className="ml-auto text-xs text-red-400 hover:text-red-600 transition-colors"
                          >
                            Quitar
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
