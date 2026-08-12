'use server'

import { getGoogleAccessToken } from '@/lib/google'
import { guardarTodos } from '@/app/(admin)/notas/actions'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface MailResumen {
  id: string
  threadId: string
  remitente: string
  remitenteEmail: string
  asunto: string
  fecha: string
  snippet: string
  noLeido: boolean
}

export interface MailDetalle {
  id: string
  remitente: string
  remitenteEmail: string
  para: string
  asunto: string
  fecha: string
  html: string | null
  texto: string | null
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailPart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPart[]
}

function parseFrom(from: string): { nombre: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (m) return { nombre: m[1].trim() || m[2], email: m[2] }
  return { nombre: from, email: from }
}

function header(headers: GmailHeader[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeBody(data?: string): string {
  if (!data) return ''
  return Buffer.from(data, 'base64url').toString('utf8')
}

// Busca recursivamente la mejor parte del cuerpo (html primero, texto después)
function extraerCuerpo(part: GmailPart): { html: string | null; texto: string | null } {
  let html: string | null = null
  let texto: string | null = null
  const walk = (p: GmailPart) => {
    if (p.mimeType === 'text/html' && p.body?.data && !html) html = decodeBody(p.body.data)
    if (p.mimeType === 'text/plain' && p.body?.data && !texto) texto = decodeBody(p.body.data)
    for (const child of p.parts ?? []) walk(child)
  }
  walk(part)
  return { html, texto }
}

async function gmailFetch(token: string, path: string, init?: RequestInit) {
  return fetch(`${GMAIL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

const NO_CONECTADO =
  'Gmail no está autorizado. Reconectá tu cuenta de Google desde Notas (● Google conectado — reconectar) para dar el permiso de lectura.'

export async function listarInbox(pageToken?: string): Promise<{
  mails?: MailResumen[]
  nextPageToken?: string
  error?: string
}> {
  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }

  const params = new URLSearchParams({ labelIds: 'INBOX', maxResults: '30' })
  if (pageToken) params.set('pageToken', pageToken)

  const listRes = await gmailFetch(token, `/messages?${params}`)
  if (!listRes.ok) {
    if (listRes.status === 403 || listRes.status === 401) return { error: NO_CONECTADO }
    return { error: `Gmail respondió ${listRes.status}` }
  }
  const list = await listRes.json()
  const ids: { id: string; threadId: string }[] = list.messages ?? []
  if (ids.length === 0) return { mails: [], nextPageToken: undefined }

  const mails = await Promise.all(
    ids.map(async ({ id, threadId }): Promise<MailResumen | null> => {
      const res = await gmailFetch(
        token,
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
      )
      if (!res.ok) return null
      const msg = await res.json()
      const headers: GmailHeader[] = msg.payload?.headers ?? []
      const { nombre, email } = parseFrom(header(headers, 'From'))
      return {
        id,
        threadId,
        remitente: nombre,
        remitenteEmail: email,
        asunto: header(headers, 'Subject') || '(sin asunto)',
        fecha: header(headers, 'Date'),
        snippet: msg.snippet ?? '',
        noLeido: (msg.labelIds ?? []).includes('UNREAD'),
      }
    })
  )

  return { mails: mails.filter((m): m is MailResumen => m !== null), nextPageToken: list.nextPageToken }
}

export async function leerMail(id: string): Promise<{ mail?: MailDetalle; error?: string }> {
  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }

  const res = await gmailFetch(token, `/messages/${id}?format=full`)
  if (!res.ok) return { error: `Gmail respondió ${res.status}` }
  const msg = await res.json()
  const headers: GmailHeader[] = msg.payload?.headers ?? []
  const { nombre, email } = parseFrom(header(headers, 'From'))
  const { html, texto } = extraerCuerpo(msg.payload ?? {})

  // Marcar como leído al abrirlo
  await gmailFetch(token, `/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })

  return {
    mail: {
      id,
      remitente: nombre,
      remitenteEmail: email,
      para: header(headers, 'To'),
      asunto: header(headers, 'Subject') || '(sin asunto)',
      fecha: header(headers, 'Date'),
      html,
      texto,
    },
  }
}

// A papelera (recuperable 30 días) — nunca borrado permanente
export async function eliminarMail(id: string): Promise<{ ok?: boolean; error?: string }> {
  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }
  const res = await gmailFetch(token, `/messages/${id}/trash`, { method: 'POST' })
  if (!res.ok) return { error: `Gmail respondió ${res.status}` }
  return { ok: true }
}

// Saca de la bandeja de entrada sin borrar
export async function archivarMail(id: string): Promise<{ ok?: boolean; error?: string }> {
  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }
  const res = await gmailFetch(token, `/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
  })
  if (!res.ok) return { error: `Gmail respondió ${res.status}` }
  return { ok: true }
}

// Crea un pendiente en el ToDo de hoy (o del lunes si es fin de semana)
export async function pasarAPendiente(texto: string): Promise<{ ok?: boolean; error?: string }> {
  if (!texto.trim()) return { error: 'Texto vacío' }
  const hoy = new Date()
  const dia = hoy.getDay()
  if (dia === 6) hoy.setDate(hoy.getDate() + 2)
  if (dia === 0) hoy.setDate(hoy.getDate() + 1)
  const fecha = hoy.toISOString().slice(0, 10)

  const result = await guardarTodos({
    [fecha]: [{ id: Date.now().toString(), text: texto.trim(), done: false }],
  })
  if (!result.ok) return { error: 'No se pudo guardar el pendiente' }
  return { ok: true }
}
