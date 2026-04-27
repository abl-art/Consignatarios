'use client'

import { useState, useRef, useCallback } from 'react'
import { guardarTodos, guardarNotas, guardarNotasGuardadas } from './actions'

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

export default function NotasClient({ initialTodos, initialNotas, initialGuardadas }: Props) {
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

      {tab === 'todo' && <TodoTab initialData={initialTodos} />}
      {tab === 'notas' && <NotasTab initialNotas={initialNotas} initialGuardadas={initialGuardadas} />}
      {tab === 'guardadas' && <GuardadasTab initialGuardadas={initialGuardadas} />}
    </div>
  )
}

// ─── ToDo Tab (vista semanal) ───────────────────────────────────────────────

function TodoTab({ initialData }: { initialData: WeekData }) {
  const [data, setData] = useState<WeekData>(initialData)
  const [weekOffset, setWeekOffset] = useState(0)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { lunes, dias } = getSemana(weekOffset)

  const persist = useCallback((updated: WeekData) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => { guardarTodos(updated as unknown as { id: string; text: string; done: boolean }[]) }, 500)
  }, [])

  function getTodos(fecha: string): Todo[] { return data[fecha] || [] }
  function updateTodos(fecha: string, todos: Todo[]) { const u = { ...data, [fecha]: todos }; setData(u); persist(u) }
  function addTodo(fecha: string, text: string) { if (!text.trim()) return; updateTodos(fecha, [...getTodos(fecha), { id: Date.now().toString(), text: text.trim(), done: false }]) }
  function toggleTodo(fecha: string, id: string) { updateTodos(fecha, getTodos(fecha).map(t => t.id === id ? { ...t, done: !t.done } : t)) }
  function deleteTodo(fecha: string, id: string) { updateTodos(fecha, getTodos(fecha).filter(t => t.id !== id)) }
  function updateText(fecha: string, id: string, text: string) { updateTodos(fecha, getTodos(fecha).map(t => t.id === id ? { ...t, text } : t)) }
  function ciclarPrioridad(fecha: string, id: string) {
    updateTodos(fecha, getTodos(fecha).map(t => {
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
        <button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Siguiente →</button>
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
              onAdd={t => addTodo(dia.fecha, t)} onToggle={id => toggleTodo(dia.fecha, id)} onDelete={id => deleteTodo(dia.fecha, id)}
              onUpdateText={(id, t) => updateText(dia.fecha, id, t)} onCiclarPrioridad={id => ciclarPrioridad(dia.fecha, id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DiaColumn({ esHoy, todos, onAdd, onToggle, onDelete, onUpdateText, onCiclarPrioridad }: {
  fecha: string; label: string; esHoy: boolean; todos: Todo[]
  onAdd: (t: string) => void; onToggle: (id: string) => void; onDelete: (id: string) => void
  onUpdateText: (id: string, t: string) => void; onCiclarPrioridad: (id: string) => void
}) {
  const [input, setInput] = useState('')
  return (
    <div className={`border-r last:border-r-0 border-gray-200 p-2 ${esHoy ? 'bg-magenta-50/30' : ''}`}>
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
