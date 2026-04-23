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
    } catch {
      setError('No se pudo acceder a la cámara.')
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

      {activa && (
        <div className="relative rounded-lg overflow-hidden border border-gray-300 bg-black">
          <video ref={videoRef} className="w-full" style={{ maxHeight: '200px', objectFit: 'cover' }} playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4/5 h-12 border-2 border-magenta-400 rounded opacity-60" />
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {conteo > 0 && (
        <p className="text-xs text-green-700">
          {conteo} escaneado{conteo > 1 ? 's' : ''} · Último: <span className="font-mono font-bold">{ultimo}</span>
        </p>
      )}
    </div>
  )
}
