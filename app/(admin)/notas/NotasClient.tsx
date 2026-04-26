'use client'

import { useState, useRef, useCallback } from 'react'
import { guardarTodos, guardarNotas } from './actions'

interface Todo {
  id: string
  text: string
  done: boolean
}

type WeekData = Record<string, Todo[]> // key = 'YYYY-MM-DD', value = todos de ese día

interface Props {
  initialTodos: WeekData
  initialNotas: string
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

function getSemana(offset: number): { lunes: Date; dias: { fecha: string; label: string; esHoy: boolean }[] } {
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
    dias.push({
      fecha,
      label: `${nombres[i]} ${d.getDate()}/${d.getMonth() + 1}`,
      esHoy: fecha === hoyStr,
    })
  }
  return { lunes, dias }
}

function formatSemana(lunes: Date): string {
  const viernes = new Date(lunes)
  viernes.setDate(lunes.getDate() + 4)
  const fmtD = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
  return `Semana ${fmtD(lunes)} al ${fmtD(viernes)}`
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function NotasClient({ initialTodos, initialNotas }: Props) {
  const [tab, setTab] = useState<'todo' | 'notas'>('todo')

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Notas y Pendientes</h1>
      <p className="text-sm text-gray-500 mb-4">Tu espacio de trabajo personal</p>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('todo')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'todo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          ToDo
        </button>
        <button onClick={() => setTab('notas')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'notas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Notas
        </button>
      </div>

      {tab === 'todo' && <TodoTab initialData={initialTodos} />}
      {tab === 'notas' && <NotasTab initialNotas={initialNotas} />}
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

  function getTodos(fecha: string): Todo[] {
    return data[fecha] || []
  }

  function updateTodos(fecha: string, todos: Todo[]) {
    const updated = { ...data, [fecha]: todos }
    setData(updated)
    persist(updated)
  }

  function addTodo(fecha: string, text: string) {
    if (!text.trim()) return
    const todos = getTodos(fecha)
    updateTodos(fecha, [...todos, { id: Date.now().toString(), text: text.trim(), done: false }])
  }

  function toggleTodo(fecha: string, id: string) {
    const todos = getTodos(fecha).map(t => t.id === id ? { ...t, done: !t.done } : t)
    updateTodos(fecha, todos)
  }

  function deleteTodo(fecha: string, id: string) {
    updateTodos(fecha, getTodos(fecha).filter(t => t.id !== id))
  }

  function updateText(fecha: string, id: string, text: string) {
    const todos = getTodos(fecha).map(t => t.id === id ? { ...t, text } : t)
    updateTodos(fecha, todos)
  }

  return (
    <div>
      {/* Navegación de semana */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekOffset(w => w - 1)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
          ← Anterior
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">{formatSemana(lunes)}</p>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-xs text-magenta-600 hover:underline">
              Ir a esta semana
            </button>
          )}
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
          Siguiente →
        </button>
      </div>

      {/* Calendario semanal */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col" style={{ minHeight: 'calc(100vh - 220px)' }}>
        {/* Headers */}
        <div className="grid grid-cols-5 border-b border-gray-200">
          {dias.map(dia => (
            <div key={dia.fecha} className={`px-3 py-2 text-xs font-semibold text-center border-r last:border-r-0 border-gray-200 ${dia.esHoy ? 'bg-magenta-50 text-magenta-700' : 'bg-gray-50 text-gray-600'}`}>
              {dia.label}
            </div>
          ))}
        </div>
        {/* Cuerpo */}
        <div className="grid grid-cols-5 flex-1">
          {dias.map(dia => (
            <DiaColumn
              key={dia.fecha}
              fecha={dia.fecha}
              label={dia.label}
              esHoy={dia.esHoy}
              todos={getTodos(dia.fecha)}
              onAdd={(text) => addTodo(dia.fecha, text)}
              onToggle={(id) => toggleTodo(dia.fecha, id)}
              onDelete={(id) => deleteTodo(dia.fecha, id)}
              onUpdateText={(id, text) => updateText(dia.fecha, id, text)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DiaColumn({
  esHoy, todos, onAdd, onToggle, onDelete, onUpdateText,
}: {
  fecha: string
  label: string
  esHoy: boolean
  todos: Todo[]
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onUpdateText: (id: string, text: string) => void
}) {
  const [input, setInput] = useState('')

  return (
    <div className={`border-r last:border-r-0 border-gray-200 p-2 ${esHoy ? 'bg-magenta-50/30' : ''}`}>
      <div className="space-y-1">
        {todos.map(t => (
          <div key={t.id} className="flex items-start gap-1.5 group">
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => onToggle(t.id)}
              className="w-3.5 h-3.5 mt-0.5 accent-magenta-600 shrink-0"
            />
            <textarea
              value={t.text}
              onChange={e => onUpdateText(t.id, e.target.value)}
              rows={1}
              onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }}
              className={`flex-1 min-w-0 text-xs bg-transparent border-none outline-none p-0 resize-none overflow-hidden ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}
            />
            <button
              onClick={() => onDelete(t.id)}
              className="text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>

      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && input.trim()) {
            onAdd(input)
            setInput('')
          }
        }}
        placeholder="+ tarea..."
        className="w-full text-xs text-gray-400 bg-transparent border-none outline-none p-0 mt-2 placeholder:text-gray-300"
      />
    </div>
  )
}

// ─── Notas Tab ──────────────────────────────────────────────────────────────

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
        } catch { /* no es fórmula válida */ }
      }
    }
    return linea
  }).join('\n')
}

function NotasTab({ initialNotas }: { initialNotas: string }) {
  const [texto, setTexto] = useState(initialNotas)
  const [preview, setPreview] = useState('')
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

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">Usá <code className="bg-gray-100 px-1 rounded">=</code> o <code className="bg-gray-100 px-1 rounded">+</code> al inicio de una línea para calcular.</p>
          <span className={`text-[10px] ${guardando ? 'text-yellow-600' : 'text-green-600'}`}>
            {guardando ? 'Guardando...' : 'Guardado'}
          </span>
        </div>
        <textarea
          value={texto}
          onChange={e => handleChange(e.target.value)}
          placeholder={"Escribí tus notas acá...\n\nEjemplos de fórmulas:\n= 150000 * 0.15\n+ 50000 + 30000 - 10000\n= (100000 * 12) / 1.21"}
          className="w-full min-h-[400px] p-4 text-sm font-mono text-gray-800 resize-y focus:outline-none"
          spellCheck={false}
        />
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
