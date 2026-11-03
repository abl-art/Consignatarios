'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { guardarRespuestaPersonal } from '@/lib/actions/reclutamiento'
import type { EntrevistaPersonal, RespuestaPersonal } from '@/lib/reclutamiento'

// Guía de entrevista personal: preguntas generadas por Claude + notas y
// puntaje 1-5 por pregunta que Emiliano carga EN VIVO durante la entrevista.
// Guardado: notas al salir del campo (y con debounce), puntaje al clic —
// los llamados se serializan para que el merge del jsonb no pise nada.

export default function EntrevistaPersonal({
  candidatoId,
  entrevista,
}: {
  candidatoId: string
  entrevista: EntrevistaPersonal | null
}) {
  const router = useRouter()
  const [generando, setGenerando] = useState(false)
  const [confirmaRegen, setConfirmaRegen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaPersonal>>(entrevista?.respuestas ?? {})
  const [guardando, setGuardando] = useState<string | null>(null)
  const colaRef = useRef<Promise<void>>(Promise.resolve())
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const generar = async () => {
    setGenerando(true)
    setError(null)
    try {
      const res = await fetch('/api/reclutamiento/entrevista-personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidato_id: candidatoId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setRespuestas({})
      setConfirmaRegen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando la entrevista')
    } finally {
      setGenerando(false)
    }
  }

  // Serializa los guardados: cada uno espera al anterior (merge server-side seguro)
  const persistir = (preguntaId: string, resp: RespuestaPersonal) => {
    setGuardando(preguntaId)
    colaRef.current = colaRef.current
      .then(() => guardarRespuestaPersonal(candidatoId, preguntaId, resp))
      .catch(() => setError('No se pudo guardar — reintentá'))
      .finally(() => setGuardando((g) => (g === preguntaId ? null : g)))
  }

  const setNota = (preguntaId: string, nota: string) => {
    setRespuestas((r) => ({ ...r, [preguntaId]: { ...r[preguntaId], nota } }))
    clearTimeout(debounceRef.current[preguntaId])
    debounceRef.current[preguntaId] = setTimeout(() => persistir(preguntaId, { nota }), 1200)
  }

  const blurNota = (preguntaId: string, nota: string) => {
    clearTimeout(debounceRef.current[preguntaId])
    persistir(preguntaId, { nota })
  }

  const setPuntaje = (preguntaId: string, puntaje: number) => {
    setRespuestas((r) => ({ ...r, [preguntaId]: { ...r[preguntaId], puntaje } }))
    persistir(preguntaId, { puntaje })
  }

  const stats = useMemo(() => {
    const puntajes = Object.values(respuestas)
      .map((r) => r.puntaje)
      .filter((p): p is number => typeof p === 'number' && p > 0)
    const total = puntajes.reduce((a, b) => a + b, 0)
    return {
      puntuadas: puntajes.length,
      total,
      promedio: puntajes.length > 0 ? Math.round((total / puntajes.length) * 10) / 10 : null,
    }
  }, [respuestas])

  if (!entrevista) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900">Entrevista personal</h2>
            <p className="text-sm text-gray-500 mt-1">
              Genera las preguntas para la entrevista cara a cara: valida los riesgos del CV y repregunta lo
              que quedó flojo en la técnica, con puntaje 1-5 en vivo.
            </p>
          </div>
          <button
            onClick={generar}
            disabled={generando}
            className="bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-800 disabled:opacity-60 shrink-0"
          >
            {generando ? 'Generando… (~30s)' : 'Generar entrevista'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="font-bold text-gray-900">Entrevista personal</h2>
        <div className="flex items-center gap-3">
          {guardando && <span className="text-xs text-gray-400">guardando…</span>}
          {!confirmaRegen ? (
            <button onClick={() => setConfirmaRegen(true)} className="text-xs text-gray-400 hover:text-gray-600">
              Regenerar
            </button>
          ) : (
            <span className="text-xs text-red-600">
              Pisa preguntas y respuestas.{' '}
              <button onClick={generar} disabled={generando} className="font-semibold underline">
                {generando ? 'Generando…' : 'Confirmar'}
              </button>{' '}
              ·{' '}
              <button onClick={() => setConfirmaRegen(false)} className="underline">
                Cancelar
              </button>
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Generada el {new Date(entrevista.generada_at).toLocaleDateString('es-AR')} · anotá la respuesta y
        puntuala del 1 al 5 durante la entrevista — se guarda solo.
      </p>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <ol className="divide-y divide-gray-100">
        {entrevista.preguntas.map((p, i) => {
          const r = respuestas[p.id] ?? {}
          return (
            <li key={p.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 mb-0.5">{p.tema}</p>
                  <p className="text-sm font-medium text-gray-900">{p.pregunta}</p>
                  <p className="text-xs text-gray-500 italic mt-1">Qué mirar: {p.busca}</p>

                  <textarea
                    defaultValue={r.nota ?? ''}
                    onChange={(e) => setNota(p.id, e.target.value)}
                    onBlur={(e) => blurNota(p.id, e.target.value)}
                    placeholder="Notas de la respuesta…"
                    rows={2}
                    className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-y"
                  />

                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 mr-1">Puntaje</span>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setPuntaje(p.id, n)}
                        className={`w-8 h-8 rounded-full border text-sm font-semibold transition-colors ${
                          r.puntaje === n
                            ? 'bg-indigo-700 text-white border-indigo-700'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-sm text-gray-500">
          <span className="text-xl font-bold text-gray-900">{stats.puntuadas}</span>
          <span className="text-gray-400">/{entrevista.preguntas.length}</span> puntuadas
        </p>
        <p className="text-sm text-gray-500">
          Total <span className="text-xl font-bold text-gray-900">{stats.total}</span>
          <span className="text-gray-400">/{entrevista.preguntas.length * 5}</span>
        </p>
        {stats.promedio !== null && (
          <p className="text-sm text-gray-500">
            Promedio <span className="text-xl font-bold text-indigo-700">{stats.promedio.toLocaleString('es-AR')}</span>
            <span className="text-gray-400">/5</span>
          </p>
        )}
      </div>
    </div>
  )
}
