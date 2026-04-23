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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ultimoRef = useRef('')

  const detener = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setActiva(false)
  }, [])

  useEffect(() => { return () => { detener() } }, [detener])

  async function iniciar() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream

      const video = videoRef.current
      if (!video) return

      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      await video.play()

      setActiva(true)

      // Escanear frames cada 500ms con BarcodeDetector o fallback
      intervalRef.current = setInterval(() => {
        scanFrame()
      }, 500)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('Error cámara: ' + msg)
    }
  }

  async function scanFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    try {
      // Intentar BarcodeDetector (Chrome 83+, Android Chrome)
      if ('BarcodeDetector' in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'itf', 'codabar']
        })
        const barcodes = await detector.detect(canvas)
        for (const barcode of barcodes) {
          procesarCodigo(barcode.rawValue)
        }
      }
    } catch {
      // BarcodeDetector no disponible o falló
    }
  }

  function procesarCodigo(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length >= 14 && digits.length <= 16 && digits !== ultimoRef.current) {
      const imei = digits.slice(0, 15)
      ultimoRef.current = imei
      setUltimo(imei)
      setConteo(c => c + 1)
      onScan(imei)
      // Reset para permitir re-escanear el mismo después de 3 segundos
      setTimeout(() => { if (ultimoRef.current === imei) ultimoRef.current = '' }, 3000)
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

      <div style={{ display: activa ? 'block' : 'none' }} className="relative rounded-lg overflow-hidden border border-gray-300 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{ width: '100%', maxHeight: '220px', objectFit: 'cover' }}
        />
        {/* Guía de escaneo */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4/5 h-14 border-2 border-green-400 rounded opacity-70" />
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {conteo > 0 && (
        <p className="text-xs text-green-700">
          {conteo} escaneado{conteo > 1 ? 's' : ''} · Último: <span className="font-mono font-bold">{ultimo}</span>
        </p>
      )}
    </div>
  )
}
