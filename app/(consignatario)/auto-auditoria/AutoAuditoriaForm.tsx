'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import EscanerIMEI from '@/components/EscanerIMEI'
import FirmaCanvas from '@/components/FirmaCanvas'
import { confirmarAutoAuditoria } from '@/lib/actions/auto-auditoria'
import type { DispositivoConModelo } from '@/lib/types'

interface Props {
  consignatarioId: string
  dispositivos: DispositivoConModelo[]
}

export default function AutoAuditoriaForm({ consignatarioId, dispositivos }: Props) {
  const router = useRouter()
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set())
  const [observaciones, setObservaciones] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ msg: string; type: 'ok' | 'warn' | 'dup' } | null>(null)

  const imeiToDevice = useMemo(() => new Map(dispositivos.map((d) => [d.imei, d])), [dispositivos])

  const gruposPorModelo = useMemo(() => {
    const map: Record<string, { marca: string; modelo: string; total: number; presentes: number }> = {}
    for (const d of dispositivos) {
      const key = `${d.modelos.marca}__${d.modelos.modelo}`
      if (!map[key]) {
        map[key] = { marca: d.modelos.marca, modelo: d.modelos.modelo, total: 0, presentes: 0 }
      }
      map[key].total++
      if (scannedIds.has(d.id)) map[key].presentes++
    }
    return Object.values(map).sort((a, b) => a.marca.localeCompare(b.marca))
  }, [dispositivos, scannedIds])

  const handleScan = useCallback((imei: string) => {
    const device = imeiToDevice.get(imei)
    if (!device) {
      setFeedback({ msg: 'Equipo no reconocido', type: 'warn' })
      return
    }
    if (scannedIds.has(device.id)) {
      setFeedback({ msg: 'Ya escaneado', type: 'dup' })
      return
    }
    setScannedIds((prev) => new Set(prev).add(device.id))
    setFeedback({ msg: `${device.modelos.marca} ${device.modelos.modelo} escaneado ✓`, type: 'ok' })
  }, [imeiToDevice, scannedIds])

  async function handleSubmit() {
    if (!firma) return
    setSubmitting(true)
    setError(null)
    const result = await confirmarAutoAuditoria({
      consignatario_id: consignatarioId,
      observaciones,
      firma_base64: firma,
      dispositivo_ids_presentes: Array.from(scannedIds),
    })
    setSubmitting(false)
    if ('error' in result && result.error) setError(result.error)
    else router.refresh()
  }

  const total = dispositivos.length
  const scanned = scannedIds.size

  return (
    <div className="space-y-6">
      {/* Global progress */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Progreso general</h2>
          <span className="text-sm font-medium text-gray-600">{scanned} / {total} equipos</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div className="bg-magenta-600 h-3 rounded-full transition-all"
            style={{ width: `${total > 0 ? (scanned / total) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Scanner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Escanear equipos</h2>
        <EscanerIMEI onScan={handleScan} />
        {feedback && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-sm font-medium ${
            feedback.type === 'ok' ? 'bg-green-50 text-green-700' :
            feedback.type === 'warn' ? 'bg-red-50 text-red-700' :
            'bg-yellow-50 text-yellow-700'
          }`}>{feedback.msg}</div>
        )}
      </div>

      {/* Per-model progress */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Avance por modelo</h2>
        <div className="space-y-4">
          {gruposPorModelo.map((g) => {
            const pct = g.total > 0 ? (g.presentes / g.total) * 100 : 0
            const completo = g.presentes === g.total
            return (
              <div key={`${g.marca}-${g.modelo}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{g.marca} {g.modelo}</span>
                  <span className={`text-sm font-bold ${completo ? 'text-green-700' : 'text-gray-600'}`}>
                    {g.presentes} / {g.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${completo ? 'bg-green-500' : 'bg-magenta-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Observations + signature */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
            rows={3} placeholder="Opcional"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>

        <FirmaCanvas onSave={setFirma} />
        {firma && <p className="text-xs text-green-700">Firma capturada ✓</p>}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button onClick={handleSubmit} disabled={!firma || submitting}
          className="w-full py-3 bg-magenta-600 text-white font-semibold rounded-lg hover:bg-magenta-700 disabled:opacity-50">
          {submitting ? 'Confirmando...' : 'Confirmar auto-auditoría'}
        </button>
      </div>
    </div>
  )
}
