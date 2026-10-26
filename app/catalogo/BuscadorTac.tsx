'use client'

import { useState } from 'react'
import type { RespuestaTac } from '@/app/api/catalogo/tac/route'

// Buscador de TACs para merchants: carga el TAC (o el IMEI completo) y sabe
// al instante si ese modelo se puede vender con GOcelular.
export default function BuscadorTac({ token }: { token: string }) {
  const [input, setInput] = useState('')
  const [resultado, setResultado] = useState<RespuestaTac | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  async function buscar() {
    if (!input.trim() || buscando) return
    setBuscando(true)
    setError(null)
    setResultado(null)
    try {
      const res = await fetch(`/api/catalogo/tac?token=${encodeURIComponent(token)}&tac=${encodeURIComponent(input)}`)
      const json = await res.json()
      if (!res.ok) setError(json.error)
      else setResultado(json)
    } catch {
      setError('No se pudo consultar — probá de nuevo')
    } finally {
      setBuscando(false)
    }
  }

  const nombreEquipo = resultado && (resultado.marca || resultado.modelo)
    ? [resultado.marca, resultado.modelo].filter(Boolean).join(' ')
    : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">🔎 Verificar un equipo por TAC</h2>
      <p className="text-xs text-gray-500 mb-3">
        Ingresá el <b>TAC</b> (los primeros 8 dígitos del IMEI) o el IMEI completo. Marcá *#06# en el equipo para ver el IMEI.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          inputMode="numeric"
          placeholder="Ej: 35225187 o el IMEI completo"
          className="flex-1 min-w-[220px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={buscar}
          disabled={buscando || !input.trim()}
          className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {buscando ? 'Consultando…' : 'Verificar'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">✗ {error}</p>}

      {resultado && resultado.vendible && (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
          <p className="text-emerald-800 font-semibold text-sm">✓ Listo para vender</p>
          <p className="text-emerald-700 text-sm mt-0.5">
            TAC {resultado.tac}{nombreEquipo ? <> — <b>{nombreEquipo}</b></> : null}
          </p>
          <p className="text-emerald-600 text-xs mt-1">
            {resultado.equiposOk} equipo{resultado.equiposOk === 1 ? '' : 's'} con este TAC ya opera{resultado.equiposOk === 1 ? '' : 'n'} en GOcelular.
          </p>
        </div>
      )}

      {resultado && !resultado.vendible && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-red-800 font-semibold text-sm">✗ No está listo para vender</p>
          <p className="text-red-700 text-sm mt-0.5">
            TAC {resultado.tac}{nombreEquipo ? <> — <b>{nombreEquipo}</b></> : null}
          </p>
          <p className="text-red-600 text-xs mt-1">Solicitá la carga a tu ejecutivo de GOcuotas.</p>
        </div>
      )}
    </div>
  )
}
