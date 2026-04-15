'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Consignatario, DispositivoConModelo } from '@/lib/types'
import { formatearMoneda, calcularPrecioVenta } from '@/lib/utils'
import { asignarStock } from '@/lib/actions/asignar'
import FirmaCanvas from '../components/FirmaCanvas'

interface AsignarFormProps {
  consignatarios: Consignatario[]
  dispositivos: DispositivoConModelo[]
  multiplicador: number
}

export default function AsignarForm({ consignatarios, dispositivos, multiplicador }: AsignarFormProps) {
  const router = useRouter()

  const [consignatarioId, setConsignatarioId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [firmadoPor, setFirmadoPor] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [filtroModelo, setFiltroModelo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const canSubmit =
    consignatarioId !== '' &&
    selected.size > 0 &&
    firmadoPor.trim() !== '' &&
    firma !== null &&
    !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)

    const result = await asignarStock({
      consignatario_id: consignatarioId,
      dispositivo_ids: Array.from(selected),
      firmado_por: firmadoPor.trim(),
      firma_base64: firma!,
      total_valor_costo: totalValorCosto,
      total_valor_venta: totalValorVenta,
    })

    if ('error' in result) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    router.push('/inventario')
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
          <option value="">Seleccioná un consignatario</option>
          {consignatarios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Device table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">
            {dispositivos.length} equipos disponibles
          </span>
          <input
            type="text"
            placeholder="Filtrar por modelo..."
            value={filtroModelo}
            onChange={(e) => setFiltroModelo(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500 w-56"
          />
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-magenta-600 focus:ring-magenta-500"
                  disabled={dispositivosFiltrados.length === 0}
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">IMEI</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Modelo</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">P. Costo</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">P. Venta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dispositivosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No hay equipos disponibles
                </td>
              </tr>
            ) : (
              dispositivosFiltrados.map((d) => {
                const isSelected = selected.has(d.id)
                const precioVenta = calcularPrecioVenta(d.modelos.precio_costo, multiplicador)
                return (
                  <tr
                    key={d.id}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-magenta-50' : 'hover:bg-gray-50'}`}
                    onClick={() => toggleOne(d.id)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(d.id)}
                        className="rounded border-gray-300 text-magenta-600 focus:ring-magenta-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {d.modelos.marca} {d.modelos.modelo}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatearMoneda(d.modelos.precio_costo)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatearMoneda(precioVenta)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Summary — only when something is selected */}
      {selected.size > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <p className="text-xs text-gray-500 mb-1">Equipos</p>
            <p className="text-3xl font-bold text-magenta-700">{selected.size}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <p className="text-xs text-gray-500 mb-1">Valor costo</p>
            <p className="text-xl font-bold text-gray-900">{formatearMoneda(totalValorCosto)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <p className="text-xs text-gray-500 mb-1">Valor venta</p>
            <p className="text-xl font-bold text-gray-900">{formatearMoneda(totalValorVenta)}</p>
          </div>
        </div>
      )}

      {/* Recibido por + Firma */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recibido por
          </label>
          <input
            type="text"
            value={firmadoPor}
            onChange={(e) => setFirmadoPor(e.target.value)}
            placeholder="Nombre completo de quien recibe"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500"
          />
        </div>

        <FirmaCanvas
          onSave={(base64) => setFirma(base64)}
        />

        {firma && (
          <p className="text-xs text-green-600 font-medium">Firma guardada correctamente.</p>
        )}
      </div>

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
            ? 'Asignando...'
            : `Asignar ${selected.size > 0 ? selected.size : ''} equipo${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </form>
  )
}
