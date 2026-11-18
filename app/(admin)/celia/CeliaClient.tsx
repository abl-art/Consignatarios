'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { borrarConversacion } from '@/lib/actions/celia'
import { useCeliaChat } from '@/components/celia/useCeliaChat'

interface Conversacion { id: string; titulo: string; updated_at: string }

export default function CeliaClient({ conversacionesIniciales }: { conversacionesIniciales: Conversacion[] }) {
  const [conversaciones, setConversaciones] = useState(conversacionesIniciales)
  const finRef = useRef<HTMLDivElement>(null)

  const chat = useCeliaChat((id, titulo) => {
    setConversaciones((prev) => [{ id, titulo, updated_at: new Date().toISOString() }, ...prev])
  })

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.mensajes, chat.estado])

  async function borrar(id: string) {
    if (chat.pensando) return
    if (!confirm('¿Borrar esta conversación?')) return
    await borrarConversacion(id)
    setConversaciones((prev) => prev.filter((c) => c.id !== id))
    if (chat.activaId === id) chat.nueva()
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4">
      {/* Historial */}
      <aside className="w-64 shrink-0 bg-white border border-gray-200 rounded-xl flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={chat.nueva}
            className={`w-full bg-gray-900 text-white text-sm rounded-lg py-2 hover:bg-gray-700 ${
              chat.pensando ? 'opacity-50 cursor-not-allowed' : ''
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
                chat.activaId === c.id ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              } ${chat.pensando ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => chat.abrirConversacion(c.id)}
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
          {chat.mensajes.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-12">
              Preguntame lo que quieras sobre ventas, echeqs, inventario, finanzas...
            </p>
          )}
          {chat.mensajes.map((m, i) =>
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
          {chat.estado && <p className="text-xs text-gray-400 italic animate-pulse">{chat.estado}</p>}
          {chat.pensando && !chat.estado && chat.mensajes[chat.mensajes.length - 1]?.texto === '' && (
            <p className="text-xs text-gray-400 italic animate-pulse">Pensando...</p>
          )}
          {chat.error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{chat.error}</p>}
          <div ref={finRef} />
        </div>
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <input
            value={chat.input}
            onChange={(e) => chat.setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && chat.enviar()}
            placeholder="Ej: ¿cuántos celulares vendió Riiing hoy?"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            disabled={chat.pensando}
          />
          <button
            onClick={chat.enviar}
            disabled={chat.pensando || !chat.input.trim()}
            className="bg-gray-900 text-white text-sm rounded-lg px-5 py-2 hover:bg-gray-700 disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </section>
    </div>
  )
}
