'use client'

import { useState, type ChangeEvent } from 'react'

type Certificado = { id: string; numero: number; articulo: string; fechaCompra: string }

type Paso = 'datos' | 'denuncia' | 'enviado'

const EXTENSIONES_ACEPTADAS = '.jpg,.jpeg,.png,.pdf'
const MAX_BYTES = 10 * 1024 * 1024
const MENSAJE_MORA = 'Para reclamar tu seguro primero debés ponerte al día con las cuotas.'

/** "2026-09-28" -> "28/09/2026". Formateo manual (no Date) para no arrastrar timezone sobre una fecha sin hora. */
function formatearFechaCorta(fechaIso: string): string {
  const [y, m, d] = fechaIso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/**
 * Flujo del cliente final (v2, regla de Emiliano 30/10/2026): DNI + N° de
 * certificado (ambos obligatorios — el número está en el mail "Tu seguro
 * contra robo") → si matchea y está al día con las cuotas, muestra la compra
 * y pide el N° de gestión de la baja del IMEI (*910) + la denuncia policial.
 * Con cuotas vencidas corta acá mismo con el mensaje de ponerse al día.
 */
export default function DenunciaForm({ token }: { token: string }) {
  const [paso, setPaso] = useState<Paso>('datos')
  const [dni, setDni] = useState('')
  const [numeroCert, setNumeroCert] = useState('')
  const [certificado, setCertificado] = useState<Certificado | null>(null)
  const [bajaImei, setBajaImei] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enMora, setEnMora] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function validar() {
    if (!dni.trim() || !numeroCert.trim() || cargando) return
    setCargando(true)
    setError(null)
    setEnMora(false)
    try {
      const res = await fetch('/api/denuncia-robo/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, dni, certificado: numeroCert }),
      })
      const json = await res.json()
      if (!json.ok) {
        if (json.motivo === 'mora') {
          setEnMora(true)
        } else {
          setError('No encontramos un seguro vigente con ese DNI y número de certificado. Revisá los datos — el número está en el mail "Tu seguro contra robo" que te enviamos al comprar.')
        }
        return
      }
      setCertificado(json.certificado as Certificado)
      setPaso('denuncia')
    } catch {
      setError('No pudimos validar los datos — probá de nuevo.')
    } finally {
      setCargando(false)
    }
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
    if (!archivo || !certificado || !bajaImei.trim() || cargando) return
    setCargando(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('token', token)
      formData.append('certificadoId', certificado.id)
      formData.append('dni', dni)
      formData.append('numeroCertificado', numeroCert)
      formData.append('bajaImei', bajaImei)
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
    <div className="space-y-4">
      {/* Requisitos siempre visibles: el robo pasa meses después de leer el mail. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-2">Para que el seguro se apruebe necesitás:</p>
        <ol className="space-y-1.5 text-xs text-gray-600">
          <li><span className="font-semibold text-gray-900">1 · Cuotas al día</span> — la cobertura se suspende con cuotas vencidas.</li>
          <li><span className="font-semibold text-gray-900">2 · Denuncia policial con el IMEI</span> del equipo (el IMEI está en el mail &quot;Tu seguro contra robo&quot; y en la caja).</li>
          <li><span className="font-semibold text-gray-900">3 · Baja del IMEI al *910</span> — llamada gratuita, cualquier compañía. Guardá el número de gestión que te da la operadora: te lo pedimos acá.</li>
        </ol>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {paso === 'datos' && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-1">DNI del titular de la compra</label>
            <input
              value={dni}
              onChange={e => { setDni(e.target.value); setEnMora(false) }}
              inputMode="numeric"
              placeholder="Ej: 30.123.456"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-3"
            />
            <label className="block text-sm font-medium text-gray-700 mb-1">N° de certificado del seguro</label>
            <input
              value={numeroCert}
              onChange={e => { setNumeroCert(e.target.value); setEnMora(false) }}
              onKeyDown={e => e.key === 'Enter' && validar()}
              inputMode="numeric"
              placeholder="Ej: 123"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-1"
            />
            <p className="text-xs text-gray-500 mb-3">
              📧 Lo encontrás en el mail que te enviamos al comprar tu equipo — buscá{' '}
              <span className="font-semibold">&quot;Tu seguro contra robo&quot;</span> en tu casilla.
            </p>
            {enMora && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
                ⚠️ {MENSAJE_MORA}
              </div>
            )}
            <button
              onClick={validar}
              disabled={cargando || !dni.trim() || !numeroCert.trim()}
              className="w-full bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {cargando ? 'Validando…' : 'Continuar'}
            </button>
          </>
        )}

        {paso === 'denuncia' && certificado && (
          <>
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <p className="font-semibold text-gray-900">{certificado.articulo}</p>
              <p className="text-xs text-gray-500">
                Certificado N° {certificado.numero} · Comprado el {formatearFechaCorta(certificado.fechaCompra)}
              </p>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              N° de gestión de la baja del IMEI
            </label>
            <input
              value={bajaImei}
              onChange={e => setBajaImei(e.target.value)}
              placeholder="El que te dio la operadora al llamar al *910"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-1"
            />
            <p className="text-xs text-gray-500 mb-3">
              ¿Todavía no hiciste la baja? Llamá gratis al <span className="font-semibold">*910</span> (cualquier compañía, las 24 hs), pedí el bloqueo por robo y anotá el número de gestión.
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adjuntá una foto o PDF de la denuncia policial
            </label>
            <p className="text-xs text-gray-500 mb-2">Debe incluir el IMEI del equipo. Formatos: JPG, PNG o PDF. Máximo 10 MB.</p>
            <input
              type="file"
              accept={EXTENSIONES_ACEPTADAS}
              onChange={onArchivoChange}
              className="w-full text-sm mb-3"
            />
            <button
              onClick={enviar}
              disabled={cargando || !archivo || !bajaImei.trim()}
              className="w-full bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {cargando ? 'Enviando…' : 'Enviar denuncia'}
            </button>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
