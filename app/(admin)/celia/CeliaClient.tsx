'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { crearConversacion, obtenerMensajes, borrarConversacion } from '@/lib/actions/celia'

interface Conversacion { id: string; titulo: string; updated_at: string }
interface MensajeUI { role: 'user' | 'assistant'; texto: string }

// Extrae solo los bloques de texto de un content jsonb guardado
function textoDeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('')
}

export default function CeliaClient({ conversacionesIniciales }: { conversacionesIniciales: Conversacion[] }) {
  const [conversaciones, setConversaciones] = useState(conversacionesIniciales)
  const [activaId, setActivaId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<MensajeUI[]>([])
  const [input, setInput] = useState('')
  const [pensando, setPensando] = useState(false)
  const [estado, setEstado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, estado])

  async function abrirConversacion(id: string) {
    if (pensando) return
    setActivaId(id)
    setError(null)
    const rows = await obtenerMensajes(id)
    // Solo user con texto plano y assistant con bloques de texto no vacios
    const ui: MensajeUI[] = []
    for (const r of rows) {
      const texto = textoDeContent(r.content)
      if (texto.trim()) ui.push({ role: r.role, texto })
    }
    setMensajes(ui)
  }

  async function enviar() {
    const pregunta = input.trim()
    if (!pregunta || pensando) return
    setInput('')
    setError(null)
    setPensando(true)

    let convId = activaId
    if (!convId) {
      convId = await crearConversacion(pregunta)
      setActivaId(convId)
      setConversaciones((prev) => [
        { id: convId!, titulo: pregunta.slice(0, 60), updated_at: new Date().toISOString() },
        ...prev,
      ])
    }

    setMensajes((prev) => [...prev, { role: 'user', texto: pregunta }, { role: 'assistant', texto: '' }])

    try {
      const res = await fetch('/api/celia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacionId: convId, mensaje: pregunta }),
      })
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
        throw new Error(msg)
      }
      if (!res.body) throw new Error('Sin respuesta del servidor')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const partes = buffer.split('\n\n')
        buffer = partes.pop() ?? ''
        for (const parte of partes) {
          if (!parte.startsWith('data: ')) continue
          let ev: { tipo: string; delta?: string; texto?: string; mensaje?: string }
          try {
            ev = JSON.parse(parte.slice(6))
          } catch {
            continue
          }
          if (ev.tipo === 'texto') {
            setEstado(null)
            setMensajes((prev) => {
              const copia = [...prev]
              const ultimo = copia[copia.length - 1]
              copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + (ev.delta ?? '') }
              return copia
            })
          } else if (ev.tipo === 'estado') {
            setEstado(ev.texto ?? null)
            // Nueva burbuja de assistant para el texto que viene despues de la consulta
            setMensajes((prev) => {
              const ultimo = prev[prev.length - 1]
              return ultimo.role === 'assistant' && ultimo.texto === ''
                ? prev
                : [...prev, { role: 'assistant', texto: '' }]
            })
          } else if (ev.tipo === 'error') {
            setError(ev.mensaje ?? 'Error desconocido')
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión')
    } finally {
      setPensando(false)
      setEstado(null)
    }
  }

  async function borrar(id: string) {
    if (pensando) return
    if (!confirm('¿Borrar esta conversación?')) return
    await borrarConversacion(id)
    setConversaciones((prev) => prev.filter((c) => c.id !== id))
    if (activaId === id) { setActivaId(null); setMensajes([]) }
  }

  function nueva() {
    if (pensando) return
    setActivaId(null)
    setMensajes([])
    setError(null)
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4">
      {/* Historial */}
      <aside className="w-64 shrink-0 bg-white border border-gray-200 rounded-xl flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={nueva}
            className={`w-full bg-gray-900 text-white text-sm rounded-lg py-2 hover:bg-gray-700 ${
              pensando ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            + Nueva conversación
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversaciones.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center justify-between px-3 py-2 text-sm rounded-lg cursor-pointer ${
                activaId === c.id ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              } ${pensando ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => abrirConversacion(c.id)}
            >
              <span className="truncate">{c.titulo}</span>
              <button
                onClick={(e) => { e.stopPropagation(); borrar(c.id) }}
                className="hidden group-hover:block text-gray-400 hover:text-red-600 text-xs ml-2"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <section className="flex-1 bg-white border border-gray-200 rounded-xl flex flex-col min-w-0">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold">Celia</h1>
          <p className="text-xs text-gray-400">Asistente de datos de GOcelular360</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mensajes.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-12">
              Preguntame lo que quieras sobre ventas, echeqs, inventario, finanzas...
            </p>
          )}
          {mensajes.map((m, i) =>
            m.texto || m.role === 'user' ? (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'bg-gray-900 text-white rounded-2xl rounded-br-sm px-4 py-2 max-w-[75%] text-sm'
                      : 'bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] text-sm [&_table]:text-xs [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:bg-gray-100 [&_p]:my-1'
                  }
                >
                  {m.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.texto}</ReactMarkdown>
                  ) : (
                    m.texto
                  )}
                </div>
              </div>
            ) : null
          )}
          {estado && <p className="text-xs text-gray-400 italic animate-pulse">{estado}</p>}
          {pensando && !estado && mensajes[mensajes.length - 1]?.texto === '' && (
            <p className="text-xs text-gray-400 italic animate-pulse">Pensando...</p>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div ref={finRef} />
        </div>
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar()}
            placeholder="Ej: ¿cuántos celulares vendió Riiing hoy?"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            disabled={pensando}
          />
          <button
            onClick={enviar}
            disabled={pensando || !input.trim()}
            className="bg-gray-900 text-white text-sm rounded-lg px-5 py-2 hover:bg-gray-700 disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </section>
    </div>
  )
}
