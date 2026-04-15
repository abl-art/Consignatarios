'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Consignatario, DispositivoConModelo } from '@/lib/types'
import { crearAuditoria } from '@/lib/actions/auditorias'
import EscanerIMEI from '../../components/EscanerIMEI'
import FirmaCanvas from '../../components/FirmaCanvas'

interface NuevaAuditoriaFormProps {
  consignatarios: Consignatario[]
  dispositivosPorConsignatario: Record<string, DispositivoConModelo[]>
}

export default function NuevaAuditoriaForm({
  consignatarios,
  dispositivosPorConsignatario,
}: NuevaAuditoriaFormProps) {
  const router = useRouter()

  const [consignatarioId, setConsignatarioId] = useState('')
  const [realizadaPor, setRealizadaPor] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [scannedIMEIs, setScannedIMEIs] = useState<Set<string>>(new Set())
  const [firma, setFirma] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanFeedback, setScanFeedback] = useState<{ message: string; type: 'green' | 'yellow' | 'red' } | null>(null)

  const dispositivos = useMemo(
    () => (consignatarioId ? (dispositivosPorConsignatario[consignatarioId] ?? []) : []),
    [consignatarioId, dispositivosPorConsignatario],
  )

  function handleConsignatarioChange(id: string) {
    setConsignatarioId(id)
    setScannedIMEIs(new Set())
    setScanFeedback(null)
  }

  const handleScan = useCallback(
    (imei: string) => {
      if (scannedIMEIs.has(imei)) {
        setScanFeedback({ message: `Ya escaneado: ${imei}`, type: 'yellow' })
        return
      }

      const found = dispositivos.find((d) => d.imei === imei)
      if (!found) {
        setScanFeedback({ message: `IMEI no esperado: ${imei}`, type: 'red' })
        return
      }

      setScannedIMEIs((prev) => new Set(prev).add(imei))
      setScanFeedback({ message: `Presente: ${imei}`, type: 'green' })
    },
    [scannedIMEIs, dispositivos]
  )

  async function handleSubmit(confirmar: boolean) {
    setError(null)

    if (!consignatarioId) {
      setError('Seleccioná un consignatario.')
      return
    }
    if (!realizadaPor.trim()) {
      setError('Ingresá el nombre de quien realiza la auditoría.')
      return
    }

    setSubmitting(true)

    const items = dispositivos.map((d) => ({
      dispositivo_id: d.id,
      presente: scannedIMEIs.has(d.imei),
    }))

    const result = await crearAuditoria({
      consignatario_id: consignatarioId,
      realizada_por: realizadaPor.trim(),
      observaciones: observaciones.trim() || undefined,
      firma_base64: firma ?? undefined,
      items,
      confirmar,
    })

    setSubmitting(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    router.push('/auditorias')
  }

  const scannedCount = scannedIMEIs.size
  const totalCount = dispositivos.length
  const progressPct = totalCount > 0 ? Math.round((scannedCount / totalCount) * 100) : 0

  return (
    <div className="space-y-8">
      {/* Consignatario */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Consignatario
        </label>
        <select
          value={consignatarioId}
          onChange={(e) => handleConsignatarioChange(e.target.value)}
          disabled={submitting}
          className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500 disabled:opacity-50"
        >
          <option value="">Seleccioná un consignatario…</option>
          {consignatarios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Dispositivos */}
      {consignatarioId && totalCount === 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 max-w-lg">
          <span>Este consignatario no tiene dispositivos asignados.</span>
        </div>
      )}

      {consignatarioId && totalCount > 0 && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="max-w-lg space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Progreso de escaneo</span>
              <span>{scannedCount} / {totalCount} ({progressPct}%)</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Scanner */}
          <div className="max-w-lg">
            <EscanerIMEI onScan={handleScan} disabled={submitting} />
          </div>

          {/* Scan feedback */}
          {scanFeedback && (
            <div
              className={`inline-flex px-3 py-2 rounded-lg text-sm font-medium ${
                scanFeedback.type === 'green'
                  ? 'bg-green-100 text-green-800'
                  : scanFeedback.type === 'yellow'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {scanFeedback.message}
            </div>
          )}

          {/* Device table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">IMEI</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Modelo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dispositivos.map((d) => {
                  const presente = scannedIMEIs.has(d.imei)
                  return (
                    <tr key={d.id} className={presente ? 'bg-green-50' : ''}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {d.modelos.marca} {d.modelos.modelo}
                      </td>
                      <td className="px-4 py-3">
                        {presente ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Presente
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Pendiente
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Realizada por */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Realizada por
        </label>
        <input
          type="text"
          value={realizadaPor}
          onChange={(e) => setRealizadaPor(e.target.value)}
          disabled={submitting}
          placeholder="Nombre del auditor"
          className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500 disabled:opacity-50"
        />
      </div>

      {/* Observaciones */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Observaciones
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          disabled={submitting}
          rows={3}
          placeholder="Notas opcionales sobre la auditoría…"
          className="w-full max-w-lg px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500 disabled:opacity-50 resize-none"
        />
      </div>

      {/* Firma */}
      <FirmaCanvas onSave={(base64) => setFirma(base64)} />

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleSubmit(false)}
          disabled={submitting}
          className="px-5 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Guardando…' : 'Guardar borrador'}
        </button>
        <button
          type="button"
          onClick={() => handleSubmit(true)}
          disabled={submitting}
          className="px-5 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Guardando…' : 'Confirmar auditoría'}
        </button>
      </div>
    </div>
  )
}
