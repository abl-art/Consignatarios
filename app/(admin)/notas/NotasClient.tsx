'use client'

import { useState, useRef, useCallback } from 'react'
import { guardarTodos, guardarNotas } from './actions'

interface Todo {
  id: string
  text: string
  done: boolean
}

interface Props {
  initialTodos: Todo[]
  initialNotas: string
}

export default function NotasClient({ initialTodos, initialNotas }: Props) {
  const [tab, setTab] = useState<'todo' | 'notas'>('todo')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Notas y Pendientes</h1>
      <p className="text-sm text-gray-500 mb-6">Tu espacio de trabajo personal</p>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('todo')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'todo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          ToDo
        </button>
        <button onClick={() => setTab('notas')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'notas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Notas
        </button>
      </div>

      {tab === 'todo' && <TodoTab initialTodos={initialTodos} />}
      {tab === 'notas' && <NotasTab initialNotas={initialNotas} />}
    </div>
  )
}

// ─── ToDo Tab ───────────────────────────────────────────────────────────────

function TodoTab({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [input, setInput] = useState('')
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = useCallback((updated: Todo[]) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => { guardarTodos(updated) }, 500)
  }, [])

  function addTodo() {
    if (!input.trim()) return
    const updated = [...todos, { id: Date.now().toString(), text: input.trim(), done: false }]
    setTodos(updated)
    setInput('')
    persist(updated)
  }

  function toggleTodo(id: string) {
    const updated = todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
    setTodos(updated)
    persist(updated)
  }

  function deleteTodo(id: string) {
    const updated = todos.filter(t => t.id !== id)
    setTodos(updated)
    persist(updated)
  }

  const pendientes = todos.filter(t => !t.done)
  const completados = todos.filter(t => t.done)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Input */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTodo() }}
            placeholder="Agregar pendiente..."
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500"
          />
          <button onClick={addTodo} className="px-4 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 shrink-0">
            +
          </button>
        </div>
      </div>

      {/* Pendientes */}
      {pendientes.length === 0 && completados.length === 0 && (
        <p className="p-8 text-center text-gray-400 text-sm">Sin pendientes. Agregá uno arriba.</p>
      )}

      <div className="divide-y divide-gray-100">
        {pendientes.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
            <input type="checkbox" checked={false} onChange={() => toggleTodo(t.id)} className="w-4 h-4 accent-magenta-600 shrink-0" />
            <span className="flex-1 text-sm text-gray-800">{t.text}</span>
            <button onClick={() => deleteTodo(t.id)} className="text-gray-300 hover:text-red-500 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>

      {/* Completados */}
      {completados.length > 0 && (
        <>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-400 font-medium">Completados ({completados.length})</p>
          </div>
          <div className="divide-y divide-gray-100">
            {completados.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 opacity-60">
                <input type="checkbox" checked={true} onChange={() => toggleTodo(t.id)} className="w-4 h-4 accent-magenta-600 shrink-0" />
                <span className="flex-1 text-sm text-gray-500 line-through">{t.text}</span>
                <button onClick={() => deleteTodo(t.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Notas Tab ──────────────────────────────────────────────────────────────

function evaluarFormula(texto: string): string {
  // Detecta líneas que empiezan con = o + y evalúa la expresión
  return texto.split('\n').map(linea => {
    const trimmed = linea.trim()
    if ((trimmed.startsWith('=') || trimmed.startsWith('+')) && trimmed.length > 1) {
      const expr = trimmed.slice(1).trim()
      // Solo permitir números, operadores y paréntesis
      if (/^[\d\s+\-*/().,%]+$/.test(expr)) {
        try {
          // Reemplazar % por /100
          const safe = expr.replace(/%/g, '/100')
          const result = new Function(`return (${safe})`)()
          if (typeof result === 'number' && isFinite(result)) {
            return `${trimmed} → ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(result)}`
          }
        } catch {
          // No es una fórmula válida, dejar como está
        }
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
    // Evaluar fórmulas para preview
    const evaluado = evaluarFormula(value)
    setPreview(evaluado !== value ? evaluado : '')
    // Auto-save
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
          <p className="text-xs text-gray-400">Escribí libremente. Usá <code className="bg-gray-100 px-1 rounded">=</code> o <code className="bg-gray-100 px-1 rounded">+</code> al inicio de una línea para calcular.</p>
          <span className={`text-[10px] ${guardando ? 'text-yellow-600' : 'text-green-600'}`}>
            {guardando ? 'Guardando...' : 'Guardado'}
          </span>
        </div>
        <textarea
          value={texto}
          onChange={e => handleChange(e.target.value)}
          placeholder="Escribí tus notas acá...&#10;&#10;Ejemplos de fórmulas:&#10;= 150000 * 0.15&#10;+ 50000 + 30000 - 10000&#10;= (100000 * 12) / 1.21"
          className="w-full min-h-[400px] p-4 text-sm font-mono text-gray-800 resize-y focus:outline-none"
          spellCheck={false}
        />
      </div>

      {/* Preview de fórmulas */}
      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-700 mb-2">Resultados</p>
          <pre className="text-sm font-mono text-blue-900 whitespace-pre-wrap">{preview}</pre>
        </div>
      )}
    </div>
  )
}
