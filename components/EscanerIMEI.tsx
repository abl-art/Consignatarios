'use client'

import { useState, useRef, useEffect } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { validarIMEI } from '@/lib/utils'

interface EscanerIMEIProps {
  onScan: (imei: string) => void
  disabled?: boolean
}

export default function EscanerIMEI({ onScan, disabled = false }: EscanerIMEIProps) {
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [inputManual, setInputManual] = useState('')
  const [errorManual, setErrorManual] = useState('')
  const [errorCamara, setErrorCamara] = useState('')
  const [ultimoEscaneado, setUltimoEscaneado] = useState('')

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerIdRef = useRef<string>('scanner-' + Math.random().toString(36).slice(2))

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [])

  async function iniciarCamara() {
    setErrorCamara('')
    try {
      const scanner = new Html5Qrcode(containerIdRef.current)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 100 } },
        (decodedText) => {
          const digitos = decodedText.replace(/\D/g, '')
          if (validarIMEI(digitos)) {
            setUltimoEscaneado(digitos)
            setErrorCamara('')
            onScan(digitos)
          }
        },
        () => {
          // scan failure — ignore per-frame errors
        }
      )

      setCamaraActiva(true)
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo acceder a la cámara'
      setErrorCamara('Error al acceder a la cámara: ' + mensaje)
      scannerRef.current = null
    }
  }

  async function detenerCamara() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
      } catch {
        // ignore stop errors
      }
      scannerRef.current = null
    }
    setCamaraActiva(false)
  }

  async function toggleCamara() {
    if (camaraActiva) {
      await detenerCamara()
    } else {
      await iniciarCamara()
    }
  }

  function agregarManual() {
    setErrorManual('')
    const imei = inputManual.trim()
    if (!validarIMEI(imei)) {
      setErrorManual('IMEI inválido. Debe tener exactamente 15 dígitos numéricos.')
      return
    }
    setUltimoEscaneado(imei)
    setInputManual('')
    onScan(imei)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      agregarManual()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value.replace(/\D/g, '').slice(0, 15)
    setInputManual(valor)
    setErrorManual('')
  }

  return (
    <div className="space-y-4">
      {/* Botón toggle cámara */}
      <button
        type="button"
        onClick={toggleCamara}
        disabled={disabled}
        className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 ${
          camaraActiva
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-magenta-600 hover:bg-magenta-700'
        }`}
      >
        {camaraActiva ? 'Detener cámara' : 'Escanear con cámara'}
      </button>

      {/* Contenedor del escáner */}
      <div
        id={containerIdRef.current}
        className={camaraActiva ? 'rounded-lg overflow-hidden border border-gray-300' : 'hidden'}
      />

      {/* Error de cámara */}
      {errorCamara && (
        <p className="text-sm text-red-600">{errorCamara}</p>
      )}

      {/* Último escaneado */}
      {ultimoEscaneado && (
        <p className="text-sm text-green-700 font-medium">
          Ultimo escaneado: {ultimoEscaneado}
        </p>
      )}

      {/* Ingreso manual */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Ingresar IMEI manualmente
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={15}
            value={inputManual}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="15 dígitos"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-magenta-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={agregarManual}
            disabled={disabled || inputManual.length === 0}
            className="px-4 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 disabled:opacity-50 transition-colors"
          >
            Agregar
          </button>
        </div>
        {errorManual && (
          <p className="text-sm text-red-600">{errorManual}</p>
        )}
      </div>
    </div>
  )
}
