'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { guardarTodos, guardarNotas, guardarNotasGuardadas, guardarNotasEventos } from './actions'

interface Todo {
  id: string
  text: string
  done: boolean
  prioridad?: 'normal' | 'negrita' | 'urgente'
}

type WeekData = Record<string, Todo[]>

interface NotaGuardada {
  id: string
  titulo: string
  texto: string
  updatedAt: string
}

interface Props {
  initialTodos: WeekData
  initialNotas: string
  initialGuardadas: NotaGuardada[]
  initialNotasEventos: Record<string, { texto?: string; color?: string; done?: boolean }>
}

// ─── Utilidades de fecha ────────────────────────────────────────────────────

function getLunes(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getSemana(offset: number) {
  const hoy = new Date()
  const lunes = getLunes(hoy)
  lunes.setDate(lunes.getDate() + offset * 7)
  const dias = []
  const hoyStr = hoy.toISOString().slice(0, 10)
  const nombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  for (let i = 0; i < 5; i++) {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    const fecha = d.toISOString().slice(0, 10)
    dias.push({ fecha, label: `${nombres[i]} ${d.getDate()}/${d.getMonth() + 1}`, esHoy: fecha === hoyStr })
  }
  return { lunes, dias }
}

function formatSemana(lunes: Date): string {
  const viernes = new Date(lunes)
  viernes.setDate(lunes.getDate() + 4)
  const f = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
  return `Semana ${f(lunes)} al ${f(viernes)}`
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function NotasClient({ initialTodos, initialNotas, initialGuardadas, initialNotasEventos }: Props) {
  const [tab, setTab] = useState<'todo' | 'notas' | 'guardadas'>('todo')

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Notas y Pendientes</h1>
      <p className="text-sm text-gray-500 mb-4">Tu espacio de trabajo personal</p>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['todo', 'notas', 'guardadas'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t === 'todo' ? 'ToDo' : t === 'notas' ? 'Notas' : `Guardadas (${initialGuardadas.length})`}
          </button>
        ))}
      </div>

      {tab === 'todo' && <TodoTab initialData={initialTodos} initialNotasEventos={initialNotasEventos} />}
      {tab === 'notas' && <NotasTab initialNotas={initialNotas} initialGuardadas={initialGuardadas} />}
      {tab === 'guardadas' && <GuardadasTab initialGuardadas={initialGuardadas} />}
    </div>
  )
}

// ─── ToDo Tab (vista semanal) ───────────────────────────────────────────────

interface CalEvent {
  id: string
  titulo: string
  horaInicio: string
  horaFin: string
  asistentes: string[]
}

function TodoTab({ initialData, initialNotasEventos }: { initialData: WeekData; initialNotasEventos: Record<string, { texto?: string; color?: string; done?: boolean }> }) {
  const [data, setData] = useState<WeekData>(initialData)
  const [weekOffset, setWeekOffset] = useState(0)
  const [eventos, setEventos] = useState<Record<string, CalEvent[]>>({})
  const [googleOk, setGoogleOk] = useState<boolean | null>(null)
  const [showCrear, setShowCrear] = useState<string | null>(null)
  const [eventoAbierto, setEventoAbierto] = useState<CalEvent | null>(null)
  const [notasEventos, setNotasEventos] = useState<Record<string, { texto?: string; color?: string; done?: boolean }>>(initialNotasEventos)
  const notasEvTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { lunes, dias } = getSemana(weekOffset)

  // Cargar eventos de Google Calendar para la semana visible
  useEffect(() => {
    async function cargar() {
      const evMap: Record<string, CalEvent[]> = {}
      for (const dia of dias) {
        try {
          const res = await fetch(`/api/calendar?fecha=${dia.fecha}`)
          if (res.status === 401) { setGoogleOk(false); return }
          const data = await res.json()
          if (data.events) evMap[dia.fecha] = data.events
          setGoogleOk(true)
        } catch { /* skip */ }
      }
      setEventos(evMap)
    }
    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  const persist = useCallback((updated: WeekData) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => { guardarTodos(updated as unknown as { id: string; text: string; done: boolean }[]) }, 500)
  }, [])

  function getTodos(fecha: string): Todo[] { return data[fecha] || [] }

  function updateTodos(fecha: string, updater: (prev: Todo[]) => Todo[]) {
    setData(prev => {
      const updated = { ...prev, [fecha]: updater(prev[fecha] || []) }
      persist(updated)
      return updated
    })
  }

  function addTodo(fecha: string, text: string) {
    if (!text.trim()) return
    updateTodos(fecha, prev => [...prev, { id: Date.now().toString(), text: text.trim(), done: false }])
  }
  function toggleTodo(fecha: string, id: string) {
    updateTodos(fecha, prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }
  function deleteTodo(fecha: string, id: string) {
    updateTodos(fecha, prev => prev.filter(t => t.id !== id))
  }
  function updateText(fecha: string, id: string, text: string) {
    updateTodos(fecha, prev => prev.map(t => t.id === id ? { ...t, text } : t))
  }
  function updateEventoMeta(eventId: string, partial: Partial<{ texto: string; color: string; done: boolean }>) {
    const current = notasEventos[eventId] || {}
    const updated = { ...notasEventos, [eventId]: { ...current, ...partial } }
    setNotasEventos(updated)
    if (notasEvTimeout.current) clearTimeout(notasEvTimeout.current)
    notasEvTimeout.current = setTimeout(() => { guardarNotasEventos(updated) }, 800)
  }

  function ciclarPrioridad(fecha: string, id: string) {
    updateTodos(fecha, prev => prev.map(t => {
      if (t.id !== id) return t
      const c = t.prioridad || 'normal'
      const next: Todo['prioridad'] = c === 'normal' ? 'negrita' : c === 'negrita' ? 'urgente' : 'normal'
      return { ...t, prioridad: next }
    }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekOffset(w => w - 1)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">← Anterior</button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{formatSemana(lunes)}</p>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-xs text-magenta-600 hover:underline">Ir a esta semana</button>}
        </div>
        <div className="flex items-center gap-2">
          {googleOk === false && (
            <a href="/api/auth/google" className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Conectar Google Calendar
            </a>
          )}
          {googleOk && <span className="text-[10px] text-green-600">● Calendar</span>}
          <button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Siguiente →</button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col" style={{ minHeight: 'calc(100vh - 220px)' }}>
        <div className="grid grid-cols-5 border-b border-gray-200">
          {dias.map(dia => (
            <div key={dia.fecha} className={`px-3 py-2 text-xs font-semibold text-center border-r last:border-r-0 border-gray-200 ${dia.esHoy ? 'bg-magenta-50 text-magenta-700' : 'bg-gray-50 text-gray-600'}`}>{dia.label}</div>
          ))}
        </div>
        <div className="grid grid-cols-5 flex-1">
          {dias.map(dia => (
            <DiaColumn key={dia.fecha} fecha={dia.fecha} label={dia.label} esHoy={dia.esHoy} todos={getTodos(dia.fecha)}
              eventos={eventos[dia.fecha] || []} googleOk={googleOk === true} notasEventos={notasEventos}
              onCrearEvento={() => setShowCrear(dia.fecha)} onClickEvento={ev => setEventoAbierto(ev)}
              onToggleEventoDone={id => updateEventoMeta(id, { done: !(notasEventos[id]?.done) })}
              onCiclarColorEvento={id => {
                const colores = ['blue', 'green', 'purple'] as const
                const current = notasEventos[id]?.color || 'blue'
                const idx = colores.indexOf(current as typeof colores[number])
                updateEventoMeta(id, { color: colores[(idx + 1) % colores.length] })
              }}
              onAdd={t => addTodo(dia.fecha, t)} onToggle={id => toggleTodo(dia.fecha, id)} onDelete={id => deleteTodo(dia.fecha, id)}
              onUpdateText={(id, t) => updateText(dia.fecha, id, t)} onCiclarPrioridad={id => ciclarPrioridad(dia.fecha, id)} />
          ))}
        </div>
      </div>

      {/* Modal crear evento */}
      {showCrear && <CrearEventoModal fecha={showCrear} onClose={() => setShowCrear(null)} />}

      {/* Panel notas del evento */}
      {eventoAbierto && (
        <EventoPanel
          evento={eventoAbierto}
          nota={(notasEventos[eventoAbierto.id]?.texto) || ''}
          onNotaChange={texto => updateEventoMeta(eventoAbierto.id, { texto })}
          onClose={() => setEventoAbierto(null)}
        />
      )}
    </div>
  )
}

function CrearEventoModal({ fecha, onClose }: { fecha: string; onClose: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [horaFin, setHoraFin] = useState('10:00')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [creando, setCreando] = useState(false)
  const [ok, setOk] = useState(false)

  async function crear() {
    if (!titulo.trim()) return
    setCreando(true)
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, fecha, horaInicio, horaFin, email, notas }),
    })
    if (res.ok) { setOk(true); setTimeout(onClose, 1000) }
    setCreando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Nuevo evento — {new Date(fecha + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        <div className="space-y-3">
          <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título del evento" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Hora inicio</label>
              <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Hora fin</label>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email del invitado (opcional)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas de preparación para la reunión..." rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" />
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={crear} disabled={creando || !titulo.trim()} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {ok ? '✓ Creado' : creando ? 'Creando...' : 'Crear evento'}
          </button>
        </div>
      </div>
    </div>
  )
}

const COLOR_MAP: Record<string, { bg: string; text: string; hover: string; check: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', hover: 'hover:bg-blue-100', check: 'accent-blue-600' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', hover: 'hover:bg-emerald-100', check: 'accent-emerald-600' },
  purple: { bg: 'bg-violet-50', text: 'text-violet-700', hover: 'hover:bg-violet-100', check: 'accent-violet-600' },
}

function DiaColumn({ esHoy, todos, eventos, googleOk, notasEventos, onAdd, onToggle, onDelete, onUpdateText, onCiclarPrioridad, onCrearEvento, onClickEvento, onToggleEventoDone, onCiclarColorEvento }: {
  fecha: string; label: string; esHoy: boolean; todos: Todo[]; eventos: CalEvent[]; googleOk: boolean
  notasEventos: Record<string, { texto?: string; color?: string; done?: boolean }>
  onAdd: (t: string) => void; onToggle: (id: string) => void; onDelete: (id: string) => void
  onUpdateText: (id: string, t: string) => void; onCiclarPrioridad: (id: string) => void
  onCrearEvento: () => void; onClickEvento: (ev: CalEvent) => void
  onToggleEventoDone: (id: string) => void; onCiclarColorEvento: (id: string) => void
}) {
  const [input, setInput] = useState('')

  const fmtHora = (iso: string) => {
    if (!iso || iso.length <= 10) return ''
    try { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
  }

  return (
    <div className={`border-r last:border-r-0 border-gray-200 p-2 ${esHoy ? 'bg-magenta-50/30' : ''}`}>
      {/* Eventos de Google Calendar */}
      {eventos.length > 0 && (
        <div className="mb-2 space-y-1">
          {eventos.map(ev => {
            const meta = notasEventos[ev.id] || {}
            const tieneNotas = !!(meta.texto)
            const done = !!(meta.done)
            const color = COLOR_MAP[meta.color || 'blue'] || COLOR_MAP.blue
            return (
              <div key={ev.id} className={`flex items-start gap-1 px-1 py-0.5 ${color.bg} rounded text-[10px] ${done ? 'opacity-50' : ''}`}>
                <input type="checkbox" checked={done} onChange={() => onToggleEventoDone(ev.id)}
                  className={`w-3 h-3 mt-0.5 shrink-0 ${color.check}`} />
                <button onClick={() => onClickEvento(ev)}
                  className={`flex-1 flex items-start gap-1 ${color.text} ${color.hover} rounded text-left transition-colors min-w-0 ${done ? 'line-through' : ''}`}>
                  <span className="font-semibold shrink-0">{fmtHora(ev.horaInicio)}</span>
                  <span className="flex-1 truncate">{ev.titulo}</span>
                  {tieneNotas && <span className="shrink-0">📝</span>}
                </button>
                <button onClick={() => onCiclarColorEvento(ev.id)} title="Cambiar color"
                  className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 border ${
                    (meta.color || 'blue') === 'blue' ? 'bg-blue-500 border-blue-500' :
                    (meta.color) === 'green' ? 'bg-emerald-500 border-emerald-500' :
                    'bg-violet-500 border-violet-500'
                  }`} />
              </div>
            )
          })}
        </div>
      )}

      {/* ToDos */}
      <div className="space-y-1">
        {todos.map(t => {
          const p = t.prioridad || 'normal'
          const cls = t.done ? 'line-through text-gray-400' : p === 'urgente' ? 'text-red-600 font-bold' : p === 'negrita' ? 'text-gray-900 font-bold' : 'text-gray-800'
          return (
            <div key={t.id} className="flex items-start gap-1.5 group">
              <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} className="w-3.5 h-3.5 mt-0.5 accent-magenta-600 shrink-0" />
              <textarea value={t.text} onChange={e => onUpdateText(t.id, e.target.value)} rows={1}
                onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }}
                className={`flex-1 min-w-0 text-xs bg-transparent border-none outline-none p-0 resize-none overflow-hidden ${cls}`} />
              <button onClick={() => onCiclarPrioridad(t.id)} title={p === 'normal' ? 'Importante' : p === 'negrita' ? 'Urgente' : 'Normal'}
                className={`shrink-0 mt-0.5 w-3 h-3 rounded-full border transition-colors ${p === 'urgente' ? 'bg-red-500 border-red-500' : p === 'negrita' ? 'bg-gray-700 border-gray-700' : 'bg-transparent border-gray-300 opacity-0 group-hover:opacity-100'}`} />
              <button onClick={() => onDelete(t.id)} className="text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )
        })}
      </div>
      <input type="text" value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAdd(input); setInput('') } }}
        placeholder="+ tarea..." className="w-full text-xs text-gray-400 bg-transparent border-none outline-none p-0 mt-2 placeholder:text-gray-300" />
      {googleOk && (
        <button onClick={onCrearEvento} className="text-[10px] text-blue-500 hover:text-blue-700 mt-1">
          + evento
        </button>
      )}
    </div>
  )
}

// ─── Panel de evento (notas + edición horario/invitados) ────────────────────

function EventoPanel({ evento, nota, onNotaChange, onClose }: {
  evento: CalEvent; nota: string; onNotaChange: (t: string) => void; onClose: () => void
}) {
  const fh = (iso: string) => {
    if (!iso || iso.length <= 10) return ''
    try { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }).slice(0, 5) } catch { return '' }
  }
  const getFecha = (iso: string) => {
    if (!iso || iso.length <= 10) return iso || ''
    try { return new Date(iso).toISOString().slice(0, 10) } catch { return '' }
  }

  const [horaInicio, setHoraInicio] = useState(fh(evento.horaInicio))
  const [horaFin, setHoraFin] = useState(fh(evento.horaFin))
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msgOk, setMsgOk] = useState('')
  const fecha = getFecha(evento.horaInicio)

  async function guardarCambios() {
    setGuardando(true)
    setMsgOk('')
    const res = await fetch('/api/calendar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: evento.id,
        horaInicio, horaFin, fecha,
        email: nuevoEmail || undefined,
      }),
    })
    if (res.ok) {
      setMsgOk('Actualizado')
      setNuevoEmail('')
      setTimeout(() => setMsgOk(''), 2000)
    }
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{evento.titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Horario editable */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500">Hora inicio</label>
            <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Hora fin</label>
            <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>

        {/* Invitados actuales */}
        {evento.asistentes.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-1">Invitados</p>
            <div className="flex flex-wrap gap-1">
              {evento.asistentes.map(a => (
                <span key={a} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{a}</span>
              ))}
            </div>
          </div>
        )}

        {/* Agregar invitado */}
        <div className="mb-3">
          <input type="email" value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)} placeholder="Agregar invitado (email)..."
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
        </div>

        <button onClick={guardarCambios} disabled={guardando}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 mb-4">
          {msgOk || (guardando ? 'Guardando...' : 'Guardar cambios en Calendar')}
        </button>

        {/* Notas privadas */}
        <div className="border-t border-gray-200 pt-3">
          <p className="text-xs font-medium text-gray-600 mb-2">Mis notas (privadas)</p>
          <textarea
            value={nota}
            onChange={e => onNotaChange(e.target.value)}
            placeholder="Preparación, agenda, puntos a tratar..."
            className="w-full min-h-[180px] p-3 border border-gray-200 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            spellCheck={false}
          />
          <p className="text-[10px] text-gray-400 mt-1">Se guardan automáticamente. No se comparten con los invitados.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Notas Tab (nueva nota con título + guardar) ────────────────────────────

function evaluarFormula(texto: string): string {
  return texto.split('\n').map(linea => {
    const trimmed = linea.trim()
    if ((trimmed.startsWith('=') || trimmed.startsWith('+')) && trimmed.length > 1) {
      const expr = trimmed.slice(1).trim()
      if (/^[\d\s+\-*/().,%]+$/.test(expr)) {
        try {
          const safe = expr.replace(/%/g, '/100')
          const result = new Function(`return (${safe})`)()
          if (typeof result === 'number' && isFinite(result)) {
            return `${trimmed} → ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(result)}`
          }
        } catch { /* no es fórmula */ }
      }
    }
    return linea
  }).join('\n')
}

function reemplazarFormulas(texto: string): string {
  return texto.split('\n').map(linea => {
    const trimmed = linea.trim()
    if ((trimmed.startsWith('=') || trimmed.startsWith('+')) && trimmed.length > 1) {
      const expr = trimmed.slice(1).trim()
      if (/^[\d\s+\-*/().,%]+$/.test(expr)) {
        try {
          const safe = expr.replace(/%/g, '/100')
          const result = new Function(`return (${safe})`)()
          if (typeof result === 'number' && isFinite(result)) {
            return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(result)
          }
        } catch { /* no es fórmula */ }
      }
    }
    return linea
  }).join('\n')
}

function NotasTab({ initialNotas, initialGuardadas }: { initialNotas: string; initialGuardadas: NotaGuardada[] }) {
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState(initialNotas)
  const [preview, setPreview] = useState('')
  const [guardadas, setGuardadas] = useState<NotaGuardada[]>(initialGuardadas)
  const [guardando, setGuardando] = useState(false)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(value: string) {
    setTexto(value)
    const evaluado = evaluarFormula(value)
    setPreview(evaluado !== value ? evaluado : '')
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      setGuardando(true)
      await guardarNotas(value)
      setGuardando(false)
    }, 1000)
  }

  function handleGuardarResultados() {
    const reemplazado = reemplazarFormulas(texto)
    setTexto(reemplazado)
    setPreview('')
    guardarNotas(reemplazado)
  }

  async function handleGuardarNota() {
    if (!titulo.trim()) return
    const nueva: NotaGuardada = { id: Date.now().toString(), titulo: titulo.trim(), texto, updatedAt: new Date().toISOString() }
    const updated = [nueva, ...guardadas]
    setGuardadas(updated)
    await guardarNotasGuardadas(updated)
    setTitulo('')
    setTexto('')
    setPreview('')
    guardarNotas('')
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-3">
          <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título de la nota..."
            className="flex-1 text-sm font-semibold text-gray-900 bg-transparent border-none outline-none placeholder:text-gray-300" />
          <div className="flex gap-2 shrink-0">
            {preview && (
              <button onClick={handleGuardarResultados} className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
                Guardar resultados
              </button>
            )}
            <button onClick={handleGuardarNota} disabled={!titulo.trim()} className="px-3 py-1 text-xs bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 disabled:opacity-40">
              Guardar nota
            </button>
            <span className={`text-[10px] self-center ${guardando ? 'text-yellow-600' : 'text-green-600'}`}>
              {guardando ? '...' : '✓'}
            </span>
          </div>
        </div>
        <textarea value={texto} onChange={e => handleChange(e.target.value)}
          placeholder={"Escribí tus notas acá...\n\nUsá = o + al inicio para calcular:\n= 150000 * 0.15\n+ 50000 + 30000 - 10000"}
          className="w-full min-h-[350px] p-4 text-sm font-mono text-gray-800 resize-y focus:outline-none" spellCheck={false} />
      </div>

      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-700 mb-2">Resultados</p>
          <pre className="text-sm font-mono text-blue-900 whitespace-pre-wrap">{preview}</pre>
        </div>
      )}
    </div>
  )
}

// ─── Guardadas Tab ──────────────────────────────────────────────────────────

function GuardadasTab({ initialGuardadas }: { initialGuardadas: NotaGuardada[] }) {
  const [guardadas, setGuardadas] = useState<NotaGuardada[]>(initialGuardadas)
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdit, setTextoEdit] = useState('')
  const [previewEdit, setPreviewEdit] = useState('')
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function abrirNota(nota: NotaGuardada) {
    setEditando(nota.id)
    setTextoEdit(nota.texto)
    setPreviewEdit('')
  }

  function handleEditChange(value: string) {
    setTextoEdit(value)
    const evaluado = evaluarFormula(value)
    setPreviewEdit(evaluado !== value ? evaluado : '')
  }

  function guardarEdicion() {
    const updated = guardadas.map(n => n.id === editando ? { ...n, texto: textoEdit, updatedAt: new Date().toISOString() } : n)
    setGuardadas(updated)
    guardarNotasGuardadas(updated)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {}, 0)
  }

  function guardarResultadosEdicion() {
    const reemplazado = reemplazarFormulas(textoEdit)
    setTextoEdit(reemplazado)
    setPreviewEdit('')
    const updated = guardadas.map(n => n.id === editando ? { ...n, texto: reemplazado, updatedAt: new Date().toISOString() } : n)
    setGuardadas(updated)
    guardarNotasGuardadas(updated)
  }

  function eliminarNota(id: string) {
    const updated = guardadas.filter(n => n.id !== id)
    setGuardadas(updated)
    guardarNotasGuardadas(updated)
    if (editando === id) setEditando(null)
  }

  if (guardadas.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-400 text-sm">Sin notas guardadas. Creá una desde la pestaña Notas.</p>
      </div>
    )
  }

  return (
    <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
      {/* Lista de notas */}
      <div className="w-64 shrink-0 space-y-1">
        {guardadas.map(n => (
          <button key={n.id} onClick={() => abrirNota(n)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${editando === n.id ? 'bg-magenta-50 border border-magenta-200' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
            <p className={`text-sm font-medium truncate ${editando === n.id ? 'text-magenta-700' : 'text-gray-900'}`}>{n.titulo}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{new Date(n.updatedAt).toLocaleDateString('es-AR')}</p>
          </button>
        ))}
      </div>

      {/* Editor */}
      {editando ? (
        <div className="flex-1 space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{guardadas.find(n => n.id === editando)?.titulo}</p>
              <div className="flex gap-2">
                {previewEdit && (
                  <button onClick={guardarResultadosEdicion} className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
                    Guardar resultados
                  </button>
                )}
                <button onClick={guardarEdicion} className="px-3 py-1 text-xs bg-magenta-600 text-white rounded-lg hover:bg-magenta-700">
                  Guardar
                </button>
                <button onClick={() => eliminarNota(editando)} className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                  Eliminar
                </button>
              </div>
            </div>
            <textarea value={textoEdit} onChange={e => handleEditChange(e.target.value)}
              className="w-full min-h-[350px] p-4 text-sm font-mono text-gray-800 resize-y focus:outline-none" spellCheck={false} />
          </div>
          {previewEdit && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-medium text-blue-700 mb-2">Resultados</p>
              <pre className="text-sm font-mono text-blue-900 whitespace-pre-wrap">{previewEdit}</pre>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Seleccioná una nota para editarla
        </div>
      )}
    </div>
  )
}
