'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCeliaChat } from './useCeliaChat'

const STORAGE_KEY = 'celia-widget-conversacion'

// Chat flotante de Celia, disponible en toda la app admin sin cambiar de
// página. Recuerda su última conversación en localStorage; la página /celia
// completa sigue siendo el lugar para el historial.
export default function CeliaWidget() {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const [restaurada, setRestaurada] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const chat = useCeliaChat((id) => {
    try { localStorage.setItem(STORAGE_KEY, id) } catch {}
  })

  // Al abrir por primera vez, retomar la última conversación del widget
  useEffect(() => {
    if (!abierto || restaurada) return
    setRestaurada(true)
    let guardada: string | null = null
    try { guardada = localStorage.getItem(STORAGE_KEY) } catch {}
    if (guardada) {
      chat.abrirConversacion(guardada).catch(() => {
        // Conversación borrada o inaccesible: arrancar de cero
        try { localStorage.removeItem(STORAGE_KEY) } catch {}
        chat.nueva()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, restaurada])

  useEffect(() => {
    if (abierto) {
      finRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chat.mensajes, chat.estado, abierto])

  useEffect(() => {
    if (abierto) inputRef.current?.focus()
  }, [abierto])

  // En la página completa de Celia el widget sobra
  if (pathname?.startsWith('/celia')) return null

  function nuevaConversacion() {
    if (chat.pensando) return
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    chat.nueva()
    inputRef.current?.focus()
  }

  return (
    <>
      {/* Botón flotante */}
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700 transition-colors flex items-center justify-center"
          title="Preguntale a Celia"
          aria-label="Abrir chat de Celia"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {/* Panel de chat */}
      {abierto && (
        <div className="fixed bottom-5 right-5 z-50 w-[400px] max-w-[calc(100vw-2.5rem)] h-[600px] max-h-[calc(100vh-5rem)] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white shrink-0">
            <div>
              <p className="text-sm font-semibold">Celia</p>
              <p className="text-[11px] text-gray-300">Asistente de datos de GOcelular360</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={nuevaConversacion}
                className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                title="Nueva conversación"
                aria-label="Nueva conversación"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <Link
                href="/celia"
                className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                title="Abrir Celia completa (historial)"
                aria-label="Abrir Celia completa"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </Link>
              <button
                onClick={() => setAbierto(false)}
                className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                title="Minimizar"
                aria-label="Minimizar chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chat.mensajes.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-10 px-4">
                Preguntame lo que quieras sobre ventas, echeqs, inventario, finanzas, cosechas...
              </p>
            )}
            {chat.mensajes.map((m, i) =>
              m.texto || m.role === 'user' ? (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      m.role === 'user'
                        ? 'bg-gray-900 text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%] text-sm'
                        : 'bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[92%] text-sm [&_table]:text-xs [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:bg-gray-100 [&_p]:my-1 overflow-x-auto'
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
            {chat.error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{chat.error}</p>}
            <div ref={finRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 flex gap-2 shrink-0">
            <input
              ref={inputRef}
              value={chat.input}
              onChange={(e) => chat.setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && chat.enviar()}
              placeholder="Preguntale a Celia..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              disabled={chat.pensando}
            />
            <button
              onClick={chat.enviar}
              disabled={chat.pensando || !chat.input.trim()}
              className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 hover:bg-gray-700 disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
