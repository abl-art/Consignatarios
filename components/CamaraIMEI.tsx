'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface Props {
  onScan: (imei: string) => void
}

export default function CamaraIMEI({ onScan }: Props) {
  const [activa, setActiva] = useState(false)
  const [error, setError] = useState('')
  const [ultimo, setUltimo] = useState('')
  const [conteo, setConteo] = useState(0)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerId = useRef('cam-' + Math.random().toString(36).slice(2))
  const ultimoRef = useRef('')

  const detener = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setActiva(false)
  }, [])

  useEffect(() => { return () => { detener() } }, [detener])

  async function iniciar() {
    setError('')
    try {
      const scanner = new Html5Qrcode(containerId.current)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 280, height: 80 },
          aspectRatio: 1.777,
        },
        (decoded) => {
          const digits = decoded.replace(/\D/g, '')
          if (digits.length >= 14 && digits.length <= 16 && digits !== ultimoRef.current) {
            const imei = digits.slice(0, 15)
            ultimoRef.current = imei
            setUltimo(imei)
            setConteo(c => c + 1)
            onScan(imei)
          }
        },
        () => {} // ignore per-frame errors
      )

      setActiva(true)
    } catch {
      setError('No se pudo acceder a la cámara. Verificá los permisos del navegador.')
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        onClick={activa ? detener : iniciar}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          activa ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {activa ? 'Cerrar cámara' : 'Escanear'}
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div
        id={containerId.current}
        className={activa ? 'rounded-lg overflow-hidden border border-gray-300' : 'hidden'}
        style={{ maxHeight: '220px' }}
      />

      {conteo > 0 && (
        <p className="text-xs text-green-700">
          {conteo} escaneado{conteo > 1 ? 's' : ''} · Último: <span className="font-mono font-bold">{ultimo}</span>
        </p>
      )}
    </div>
  )
}
