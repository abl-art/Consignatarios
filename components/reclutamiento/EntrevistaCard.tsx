'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EntrevistaRow } from '@/lib/actions/reclutamiento'
import type { AnalisisEntrevista } from '@/lib/reclutamiento'

const ESTADO_UI: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-gray-100 text-gray-600' },
  transcribiendo: { texto: 'Transcribiendo…', clase: 'bg-blue-100 text-blue-700' },
  analizando: { texto: 'Analizando con IA…', clase: 'bg-blue-100 text-blue-700' },
  listo: { texto: '✓ Analizada', clase: 'bg-green-100 text-green-800' },
  error: { texto: 'Error', clase: 'bg-red-100 text-red-700' },
}

export default function EntrevistaCard({ entrevista }: { entrevista: EntrevistaRow }) {
  const router = useRouter()
  const [verTranscript, setVerTranscript] = useState(false)
  const enProceso = entrevista.estado === 'transcribiendo' || entrevista.estado === 'analizando'
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Mientras se procesa, consultar el estado cada 15s (el endpoint además
  // encadena el análisis con Claude cuando la transcripción termina)
  useEffect(() => {
    if (!enProceso) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/reclutamiento/entrevista/estado?id=${entrevista.id}`)
        const data = await res.json()
        if (data.estado && data.estado !== entrevista.estado) router.refresh()
      } catch {
        /* reintenta en el próximo tick */
      }
    }, 15000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [enProceso, entrevista.id, entrevista.estado, router])

  const estadoUi = ESTADO_UI[entrevista.estado] || ESTADO_UI.pendiente
  const analisis = entrevista.analisis as AnalisisEntrevista | null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="font-semibold text-gray-900">
          {entrevista.titulo || 'Entrevista'}
          {entrevista.duracion_min ? ` · ${entrevista.duracion_min} min` : ''}
        </h3>
        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${estadoUi.clase}`}>
          {estadoUi.texto}
        </span>
        {analisis?.veredicto && (
          <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-yellow-100 text-yellow-800">
            {analisis.veredicto}
          </span>
        )}
      </div>

      {entrevista.estado === 'error' && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-4 py-3 mb-3">{entrevista.error}</p>
      )}
      {enProceso && (
        <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-4 py-3 mb-3">
          El video se está {entrevista.estado === 'transcribiendo' ? 'transcribiendo' : 'analizando'} —
          esta página se actualiza sola cuando termine.
        </p>
      )}

      {entrevista.drive_file_id && (
        <iframe
          src={`https://drive.google.com/file/d/${entrevista.drive_file_id}/preview`}
          className="w-full aspect-video rounded-lg border border-gray-200 mb-3"
          allow="autoplay; fullscreen"
        />
      )}

      {analisis && (
        <>
          {analisis.intro && <p className="text-xs text-gray-500 mb-3">{analisis.intro}</p>}
          <div className="grid md:grid-cols-2 gap-5 mb-3">
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-2">Lo que mostró bien</h4>
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {analisis.bien?.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-2">Lo que quedó flojo</h4>
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {analisis.mal?.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          </div>
          {analisis.lectura && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 mb-3">
              <b>Lectura del reclutador:</b> {analisis.lectura}
            </div>
          )}
        </>
      )}

      {entrevista.transcript && (
        <div>
          <button
            onClick={() => setVerTranscript(!verTranscript)}
            className="text-xs text-indigo-700 hover:underline"
          >
            {verTranscript ? 'Ocultar transcripción' : 'Ver transcripción completa'}
          </button>
          {verTranscript && (
            <div className="mt-2 max-h-80 overflow-y-auto bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-600 whitespace-pre-wrap">
              {entrevista.transcript}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
