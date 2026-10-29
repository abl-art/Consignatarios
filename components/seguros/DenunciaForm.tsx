'use client'

import { useState, type ChangeEvent } from 'react'

type Certificado = { id: string; articulo: string; fechaCompra: string }

type Paso = 'dni' | 'elegir' | 'archivo' | 'enviado'

const EXTENSIONES_ACEPTADAS = '.jpg,.jpeg,.png,.pdf'
const MAX_BYTES = 10 * 1024 * 1024

/** "2026-09-28" -> "28/09/2026". Formateo manual (no Date) para no arrastrar timezone sobre una fecha sin hora. */
function formatearFechaCorta(fechaIso: string): string {
  const [y, m, d] = fechaIso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/**
 * Flujo del cliente final: DNI → validar (matchea contra certificados
 * vigentes) → elegir la compra si hay más de una → adjuntar foto/PDF →
 * enviar → pantalla de confirmación. La mora nunca se muestra acá — este
 * componente ni siquiera la recibe, solo lo que devuelve /validar
 * (id, artículo, fecha de compra).
 */
export default function DenunciaForm({ token }: { token: string }) {
  const [paso, setPaso] = useState<Paso>('dni')
  const [dni, setDni] = useState('')
  const [certificados, setCertificados] = useState<Certificado[]>([])
  const [certificadoId, setCertificadoId] = useState<string | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function validar() {
    if (!dni.trim() || cargando) return
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/denuncia-robo/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, dni }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError('No encontramos un seguro vigente para ese DNI. Revisá el número o escribinos.')
        return
      }
      const lista = json.certificados as Certificado[]
      setCertificados(lista)
      if (lista.length === 1) {
        setCertificadoId(lista[0].id)
        setPaso('archivo')
      } else {
        setPaso('elegir')
      }
    } catch {
      setError('No pudimos validar el DNI — probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  function elegirCertificado(id: string) {
    setCertificadoId(id)
    setError(null)
    setPaso('archivo')
  }

  function onArchivoChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setError(null)
    if (f && f.size > MAX_BYTES) {
      setError('El archivo supera los 10MB.')
      setArchivo(null)
      return
    }
    setArchivo(f)
  }

  async function enviar() {
    if (!archivo || !certificadoId || cargando) return
    setCargando(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('token', token)
      formData.append('certificadoId', certificadoId)
      formData.append('dni', dni)
      formData.append('archivo', archivo)
      const res = await fetch('/api/denuncia-robo', { method: 'POST', body: formData })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error || 'No pudimos registrar la denuncia — probá de nuevo.')
        return
      }
      setPaso('enviado')
    } catch {
      setError('No pudimos registrar la denuncia — probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  if (paso === 'enviado') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-3xl mb-2">✓</p>
        <p className="text-base font-semibold text-gray-900">Recibimos tu denuncia</p>
        <p className="text-sm text-gray-500 mt-1">Te contactamos dentro de las 48 horas hábiles.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {paso === 'dni' && (
        <>
          <label className="block text-sm font-medium text-gray-700 mb-1">DNI del titular de la compra</label>
          <input
            value={dni}
            onChange={e => setDni(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && validar()}
            inputMode="numeric"
            placeholder="Ej: 30.123.456"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-3"
          />
          <button
            onClick={validar}
            disabled={cargando || !dni.trim()}
            className="w-full bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {cargando ? 'Buscando…' : 'Continuar'}
          </button>
        </>
      )}

      {paso === 'elegir' && (
        <>
          <p className="text-sm font-medium text-gray-700 mb-3">Elegí la compra que querés denunciar</p>
          <div className="space-y-2">
            {certificados.map(c => (
              <button
                key={c.id}
                onClick={() => elegirCertificado(c.id)}
                className="w-full text-left border border-gray-300 rounded-lg px-3 py-2.5 text-sm hover:bg-gray-50"
              >
                <span className="font-medium text-gray-900 block">{c.articulo}</span>
                <span className="block text-xs text-gray-500">Comprado el {formatearFechaCorta(c.fechaCompra)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {paso === 'archivo' && (
        <>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Adjuntá una foto o PDF de la denuncia policial
          </label>
          <p className="text-xs text-gray-500 mb-2">Formatos: JPG, PNG o PDF. Máximo 10 MB.</p>
          <input
            type="file"
            accept={EXTENSIONES_ACEPTADAS}
            onChange={onArchivoChange}
            className="w-full text-sm mb-3"
          />
          <button
            onClick={enviar}
            disabled={cargando || !archivo}
            className="w-full bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {cargando ? 'Enviando…' : 'Enviar denuncia'}
          </button>
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
