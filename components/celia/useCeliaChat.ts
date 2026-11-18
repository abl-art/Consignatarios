'use client'

import { useState } from 'react'
import { crearConversacion, obtenerMensajes } from '@/lib/actions/celia'

export interface MensajeUI {
  role: 'user' | 'assistant'
  texto: string
}

// Extrae solo los bloques de texto de un content jsonb guardado
export function textoDeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('')
}

// Lógica compartida del chat de Celia (página completa y widget flotante):
// conversación activa, carga de historial y streaming SSE contra /api/celia/chat.
export function useCeliaChat(onConversacionCreada?: (id: string, titulo: string) => void) {
  const [activaId, setActivaId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<MensajeUI[]>([])
  const [input, setInput] = useState('')
  const [pensando, setPensando] = useState(false)
  const [estado, setEstado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      try {
        convId = await crearConversacion(pregunta)
        setActivaId(convId)
        onConversacionCreada?.(convId, pregunta.slice(0, 60))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo crear la conversación')
        setInput(pregunta)
        setPensando(false)
        return
      }
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
      // El usuario no debe perder lo que escribió: lo restauramos en el
      // input para que pueda reintentar con Enviar.
      setInput(pregunta)
    } finally {
      setPensando(false)
      setEstado(null)
    }
  }

  function nueva() {
    if (pensando) return
    setActivaId(null)
    setMensajes([])
    setError(null)
  }

  return {
    activaId,
    setActivaId,
    mensajes,
    setMensajes,
    input,
    setInput,
    pensando,
    estado,
    error,
    setError,
    abrirConversacion,
    enviar,
    nueva,
  }
}
