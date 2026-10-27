'use client'

// Backlog Operaciones: Emiliano carga tareas para Yami con prioridad; al
// crear se le avisa por mail, y al marcarse realizada se le carga un ToDo a
// Emiliano el día de la completación (pestaña ToDo).

import { useEffect, useState, useTransition } from 'react'
import {
  getBacklog,
  crearTareaBacklog,
  marcarRealizadaBacklog,
  borrarTareaBacklog,
  reenviarMailBacklog,
} from '@/lib/actions/backlog-operaciones'
import { ordenarBacklog, labelPrioridad, PRIORIDADES, type TareaBacklog, type PrioridadBacklog } from '@/lib/backlog-operaciones'

const CHIP: Record<PrioridadBacklog, string> = {
  urgente: 'text-rose-700 bg-rose-50 border-rose-200',
  durante_dia: 'text-amber-700 bg-amber-50 border-amber-200',
  puede_esperar: 'text-gray-600 bg-gray-50 border-gray-200',
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function BacklogTab() {
  const [tareas, setTareas] = useState<TareaBacklog[]>([])
  const [titulo, setTitulo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [prioridad, setPrioridad] = useState<PrioridadBacklog>('durante_dia')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [armada, setArmada] = useState<{ id: string; accion: 'realizada' | 'borrar' } | null>(null)
  const [enviando, startTransition] = useTransition()

  const refrescar = () => getBacklog().then(setTareas)
  useEffect(() => { refrescar() }, [])

  const pendientes = ordenarBacklog(tareas.filter(t => !t.realizadoAt))
  const realizadas = tareas.filter(t => t.realizadoAt).sort((a, b) => (b.realizadoAt ?? '').localeCompare(a.realizadoAt ?? ''))

  function crear() {
    if (!titulo.trim() || enviando) return
    setError(null)
    setAviso(null)
    startTransition(async () => {
      const res = await crearTareaBacklog(titulo, detalle, prioridad)
      if (res.error) { setError(res.error); return }
      setTitulo('')
      setDetalle('')
      setAviso(res.mailError ? `⚠ ${res.mailError}` : '✓ Tarea cargada — mail enviado a Yami')
      refrescar()
    })
  }

  function ejecutar(id: string, accion: 'realizada' | 'borrar') {
    if (armada?.id !== id || armada.accion !== accion) {
      setArmada({ id, accion })
      return
    }
    setError(null)
    startTransition(async () => {
      const res = accion === 'realizada' ? await marcarRealizadaBacklog(id) : await borrarTareaBacklog(id)
      if (res.error) setError(res.error)
      setArmada(null)
      refrescar()
    })
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Nueva tarea para Yami</h2>
        <input
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && crear()}
          placeholder="¿Qué hay que hacer?"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
        />
        <textarea
          value={detalle}
          onChange={e => setDetalle(e.target.value)}
          placeholder="Detalle (opcional)"
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
        />
        <div className="flex flex-wrap items-center gap-2">
          {PRIORIDADES.map(p => (
            <button
              key={p.id}
              onClick={() => setPrioridad(p.id)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                prioridad === p.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={crear}
            disabled={enviando || !titulo.trim()}
            className="ml-auto bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {enviando ? 'Cargando…' : 'Cargar y avisar a Yami 📧'}
          </button>
        </div>
        {aviso && <p className={`mt-2 text-xs ${aviso.startsWith('⚠') ? 'text-amber-600' : 'text-emerald-600'}`}>{aviso}</p>}
        {error && <p className="mt-2 text-xs text-red-600">✗ {error}</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Pendientes ({pendientes.length})</h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-gray-400">Nada pendiente 🎉</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pendientes.map(t => (
              <li key={t.id} className="py-2.5 flex flex-wrap items-start gap-2">
                <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border whitespace-nowrap ${CHIP[t.prioridad]}`}>
                  {labelPrioridad(t.prioridad)}
                </span>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm text-gray-900">{t.titulo}</p>
                  {t.detalle && <p className="text-xs text-gray-500">{t.detalle}</p>}
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    cargada {fechaCorta(t.creadoAt)}
                    {!t.mailEnviadoAt && (
                      <>
                        {' · '}
                        <button onClick={() => startTransition(async () => { const r = await reenviarMailBacklog(t.id); if (r.error) setError(r.error); else refrescar() })} className="text-amber-600 hover:underline">
                          ⚠ mail sin enviar — reintentar
                        </button>
                      </>
                    )}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <button
                    onClick={() => ejecutar(t.id, 'realizada')}
                    disabled={enviando}
                    className={`text-xs font-medium rounded-lg px-2.5 py-1 transition-colors ${
                      armada?.id === t.id && armada.accion === 'realizada'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {armada?.id === t.id && armada.accion === 'realizada' ? '¿Realizada?' : '✓ Realizada'}
                  </button>
                  <button
                    onClick={() => ejecutar(t.id, 'borrar')}
                    disabled={enviando}
                    title="Borrar tarea cargada por error"
                    className={`text-xs rounded-lg px-2 py-1 transition-colors ${
                      armada?.id === t.id && armada.accion === 'borrar'
                        ? 'bg-red-600 text-white'
                        : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {armada?.id === t.id && armada.accion === 'borrar' ? '¿Borrar?' : '✕'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {realizadas.length > 0 && (
        <details className="bg-white rounded-xl border border-gray-200 p-5">
          <summary className="text-sm font-semibold text-gray-700 cursor-pointer">✓ Realizadas ({realizadas.length})</summary>
          <ul className="divide-y divide-gray-100 mt-3">
            {realizadas.map(t => (
              <li key={t.id} className="py-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border ${CHIP[t.prioridad]}`}>{labelPrioridad(t.prioridad)}</span>
                <span className="line-through">{t.titulo}</span>
                <span className="text-[10px] text-gray-400 ml-auto">realizada {t.realizadoAt ? fechaCorta(t.realizadoAt) : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
