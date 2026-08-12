'use server'

import { getGoogleAccessToken } from '@/lib/google'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarTodos } from '@/app/(admin)/notas/actions'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export type VistaMails = 'inbox' | 'pedidos' | 'cristian' | 'soporte'

const CRISTIAN = 'cristian@gocuotas.com'
const SOPORTE_GOCELULAR = 'gocuotasprod@cloud.trustonic.com'

export interface MailResumen {
  id: string
  threadId: string
  remitente: string
  remitenteEmail: string
  para: string
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

// IDs ocultados solo en la app (en Gmail quedan intactos)
async function getOcultos(): Promise<Set<string>> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'mails_ocultos_app').single()
  if (!data?.value) return new Set()
  try {
    return new Set(JSON.parse(data.value) as string[])
  } catch {
    return new Set()
  }
}

// Oculta el mail solo en esta seccion — no toca nada en Gmail
export async function ocultarMailApp(id: string): Promise<{ ok?: boolean; error?: string }> {
  const sb = createAdminClient()
  const ocultos = Array.from(await getOcultos())
  ocultos.push(id)
  const { error } = await sb.from('flujo_config').upsert({
    key: 'mails_ocultos_app',
    value: JSON.stringify(ocultos.slice(-2000)),
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  return { ok: true }
}

function buildQuery(vista: VistaMails, busqueda?: string): string {
  const partes: string[] = []
  if (vista === 'inbox') {
    // Bandeja limpia: el soporte Trustonic va a su propia vista, y de
    // Basecamp solo quedan asignaciones/menciones (fuera los digests)
    partes.push('in:inbox')
    partes.push(`-from:${SOPORTE_GOCELULAR}`)
    partes.push('-(from:app.basecamp.com {subject:"latest activity" subject:"here are your tasks"})')
  }
  if (vista === 'pedidos') partes.push('in:sent subject:"Pedido GOcelular"')
  if (vista === 'cristian') partes.push(`(from:${CRISTIAN} OR cc:${CRISTIAN} OR to:${CRISTIAN})`)
  // Incluye tambien los ya borrados (papelera) para poder analizar quejas
  if (vista === 'soporte') partes.push(`in:anywhere from:${SOPORTE_GOCELULAR}`)
  if (busqueda?.trim()) partes.push(busqueda.trim())
  return partes.join(' ')
}

export async function listarMails(input?: {
  vista?: VistaMails
  busqueda?: string
  pageToken?: string
}): Promise<{
  mails?: MailResumen[]
  nextPageToken?: string
  error?: string
}> {
  const vista = input?.vista ?? 'inbox'
  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }

  const params = new URLSearchParams({ maxResults: '30', q: buildQuery(vista, input?.busqueda) })
  if (input?.pageToken) params.set('pageToken', input.pageToken)

  const [listRes, ocultos] = await Promise.all([gmailFetch(token, `/messages?${params}`), getOcultos()])
  if (!listRes.ok) {
    if (listRes.status === 403 || listRes.status === 401) return { error: NO_CONECTADO }
    return { error: `Gmail respondió ${listRes.status}` }
  }
  const list = await listRes.json()
  const ids: { id: string; threadId: string }[] = (list.messages ?? []).filter(
    (m: { id: string }) => !ocultos.has(m.id)
  )
  if (ids.length === 0) return { mails: [], nextPageToken: list.nextPageToken }

  const mails = await Promise.all(
    ids.map(async ({ id, threadId }): Promise<MailResumen | null> => {
      const res = await gmailFetch(
        token,
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
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
        para: header(headers, 'To'),
        asunto: header(headers, 'Subject') || '(sin asunto)',
        fecha: header(headers, 'Date'),
        snippet: msg.snippet ?? '',
        noLeido: (msg.labelIds ?? []).includes('UNREAD'),
      }
    })
  )

  // No leidos primero; dentro de cada grupo, mas recientes arriba
  const ordenados = mails
    .filter((m): m is MailResumen => m !== null)
    .sort((a, b) => {
      if (a.noLeido !== b.noLeido) return a.noLeido ? -1 : 1
      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    })

  return { mails: ordenados, nextPageToken: list.nextPageToken }
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
