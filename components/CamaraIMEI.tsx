'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Props {
  onScan: (imei: string) => void
}

export default function CamaraIMEI({ onScan }: Props) {
  const [activa, setActiva] = useState(false)
  const [error, setError] = useState('')
  const [ultimo, setUltimo] = useState('')
  const [conteo, setConteo] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(false)
  const ultimoRef = useRef('')

  const detener = useCallback(() => {
    scanningRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setActiva(false)
  }, [])

  useEffect(() => { return () => { detener() } }, [detener])

  async function iniciar() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setActiva(true)
      scanningRef.current = true
      escanearLoop()
    } catch (e) {
      setError('No se pudo acceder a la cámara. Verificá los permisos.')
    }
  }

  function escanearLoop() {
    if (!scanningRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      requestAnimationFrame(escanearLoop)
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    // Intentar con BarcodeDetector si está disponible
    if ('BarcodeDetector' in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'itf'] })
      detector.detect(canvas).then((barcodes: { rawValue: string }[]) => {
        for (const barcode of barcodes) {
          const digits = barcode.rawValue.replace(/\D/g, '')
          if (digits.length === 15 && digits !== ultimoRef.current) {
            ultimoRef.current = digits
            setUltimo(digits)
            setConteo(c => c + 1)
            onScan(digits)
          }
        }
      }).catch(() => {})
    }

    if (scanningRef.current) {
      setTimeout(() => requestAnimationFrame(escanearLoop), 200)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={activa ? detener : iniciar}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg text-white transition-colors ${
          activa ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-900'
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {activa ? 'Detener cámara' : 'Escanear con cámara'}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {activa && (
        <div className="relative rounded-lg overflow-hidden border-2 border-gray-800 bg-black">
          <video ref={videoRef} className="w-full" playsInline muted />
          {/* Guía de escaneo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4/5 h-16 border-2 border-magenta-400 rounded-lg opacity-60" />
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {conteo > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm text-green-700">
            {conteo} IMEI{conteo > 1 ? 's' : ''} escaneado{conteo > 1 ? 's' : ''} · Último: <span className="font-mono font-bold">{ultimo}</span>
          </span>
        </div>
      )}
    </div>
  )
}
