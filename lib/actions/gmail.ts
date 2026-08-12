'use server'

import { getGoogleAccessToken } from '@/lib/google'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarTodos } from '@/app/(admin)/notas/actions'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export type VistaMails = 'inbox' | 'importantes' | 'basecamp' | 'cristian' | 'soporte' | 'pedidos' | 'enviados'

const CRISTIAN = 'cristian@gocuotas.com'
const SOPORTE_GOCELULAR = 'gocuotasprod@cloud.trustonic.com'
const BASECAMP = 'app.basecamp.com'
// Digests de Basecamp que no son asignaciones ni conversaciones
const BASECAMP_DIGESTS = '{subject:"latest activity" subject:"here are your tasks"}'
// Cierres de lote SPS de Payway: se archivan solos, no sirven
const SPS_QUERY = 'from:ayuda-ventasonline@payway.com.ar subject:"SPS - Resultado Cierre Lote"'

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

export interface AdjuntoInfo {
  attachmentId: string
  filename: string
  mimeType: string
  sizeBytes: number
}

export interface MailDetalle {
  id: string
  threadId: string
  remitente: string
  remitenteEmail: string
  para: string
  cc: string
  asunto: string
  fecha: string
  messageIdHeader: string
  html: string | null
  texto: string | null
  adjuntos: AdjuntoInfo[]
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailPart {
  mimeType?: string
  filename?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailPart[]
}

function extraerAdjuntos(part: GmailPart): AdjuntoInfo[] {
  const out: AdjuntoInfo[] = []
  const walk = (p: GmailPart) => {
    if (p.filename && p.body?.attachmentId) {
      out.push({
        attachmentId: p.body.attachmentId,
        filename: p.filename,
        mimeType: p.mimeType ?? 'application/octet-stream',
        sizeBytes: p.body.size ?? 0,
      })
    }
    for (const child of p.parts ?? []) walk(child)
  }
  walk(part)
  return out
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
    if (busqueda?.trim()) {
      // Con busqueda se rastrea TODA la bandeja de entrada (leidos incluidos)
      partes.push('in:inbox')
    } else {
      // Sin busqueda: solo no leidos (inbox zero). Soporte Trustonic y
      // Basecamp tienen su propia vista; los cierres SPS se archivan solos
      partes.push('in:inbox is:unread')
      partes.push(`-from:${SOPORTE_GOCELULAR}`)
      partes.push(`-from:${BASECAMP}`)
      partes.push(`-(${SPS_QUERY})`)
    }
  }
  // Los marcados con la estrella desde la app o desde Gmail
  if (vista === 'importantes') partes.push('is:starred')
  // Solo asignaciones, menciones y conversaciones (sin digests)
  if (vista === 'basecamp') partes.push(`from:${BASECAMP} -${BASECAMP_DIGESTS}`)
  // Solo donde Cristian es el remitente (si esta copiado va a la bandeja)
  if (vista === 'cristian') partes.push(`from:${CRISTIAN}`)
  // Incluye tambien los ya borrados (papelera) para poder analizar quejas
  if (vista === 'soporte') partes.push(`in:anywhere from:${SOPORTE_GOCELULAR}`)
  if (vista === 'pedidos') partes.push('in:sent subject:"Pedido GOcelular"')
  if (vista === 'enviados') partes.push('in:sent')
  if (busqueda?.trim()) partes.push(busqueda.trim())
  return partes.join(' ')
}

// Archiva en Gmail los cierres de lote SPS de Payway (no sirven).
// Se dispara al abrir la bandeja; batchModify saca la etiqueta INBOX.
export async function archivarSpsAutomatico(): Promise<{ archivados: number }> {
  const token = await getGoogleAccessToken()
  if (!token) return { archivados: 0 }
  const params = new URLSearchParams({ maxResults: '100', q: `in:inbox ${SPS_QUERY}` })
  const res = await gmailFetch(token, `/messages?${params}`)
  if (!res.ok) return { archivados: 0 }
  const ids: string[] = ((await res.json()).messages ?? []).map((m: { id: string }) => m.id)
  if (ids.length === 0) return { archivados: 0 }
  await gmailFetch(token, `/messages/batchModify`, {
    method: 'POST',
    body: JSON.stringify({ ids, removeLabelIds: ['INBOX'] }),
  })
  return { archivados: ids.length }
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
      threadId: msg.threadId ?? '',
      remitente: nombre,
      remitenteEmail: email,
      para: header(headers, 'To'),
      cc: header(headers, 'Cc'),
      asunto: header(headers, 'Subject') || '(sin asunto)',
      fecha: header(headers, 'Date'),
      messageIdHeader: header(headers, 'Message-ID'),
      html,
      texto,
      adjuntos: extraerAdjuntos(msg.payload ?? {}),
    },
  }
}

// Devuelve el contenido del adjunto en base64 para descargarlo en el cliente
export async function descargarAdjunto(
  mensajeId: string,
  attachmentId: string
): Promise<{ base64?: string; error?: string }> {
  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }
  const res = await gmailFetch(token, `/messages/${mensajeId}/attachments/${attachmentId}`)
  if (!res.ok) return { error: `Gmail respondió ${res.status}` }
  const data = await res.json()
  // Gmail devuelve base64url; se normaliza a base64 estandar
  return { base64: Buffer.from(data.data ?? '', 'base64url').toString('base64') }
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

// Destaca y marca importante en Gmail
export async function marcarImportante(id: string): Promise<{ ok?: boolean; error?: string }> {
  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }
  const res = await gmailFetch(token, `/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: ['IMPORTANT', 'STARRED'] }),
  })
  if (!res.ok) return { error: `Gmail respondió ${res.status}` }
  return { ok: true }
}

// Vuelve a marcar como no leido (reaparece en la bandeja)
export async function marcarNoLeido(id: string): Promise<{ ok?: boolean; error?: string }> {
  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }
  const res = await gmailFetch(token, `/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
  })
  if (!res.ok) return { error: `Gmail respondió ${res.status}` }
  return { ok: true }
}

export interface AdjuntoNuevo {
  filename: string
  mimeType: string
  base64: string
}

function armarMime(opts: {
  para: string
  cc?: string
  asunto: string
  html: string
  adjuntos: AdjuntoNuevo[]
  inReplyTo?: string
}): string {
  const headers = [`To: ${opts.para}`]
  if (opts.cc) headers.push(`Cc: ${opts.cc}`)
  headers.push(`Subject: =?UTF-8?B?${Buffer.from(opts.asunto).toString('base64')}?=`)
  if (opts.inReplyTo) {
    headers.push(`In-Reply-To: ${opts.inReplyTo}`)
    headers.push(`References: ${opts.inReplyTo}`)
  }
  headers.push('MIME-Version: 1.0')

  if (opts.adjuntos.length === 0) {
    return [
      ...headers,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(opts.html).toString('base64'),
    ].join('\r\n')
  }

  const boundary = `----gocelular${Date.now()}`
  const partes = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.html).toString('base64'),
  ]
  for (const adj of opts.adjuntos) {
    partes.push(
      `--${boundary}`,
      `Content-Type: ${adj.mimeType}; name="${adj.filename}"`,
      `Content-Disposition: attachment; filename="${adj.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      adj.base64
    )
  }
  partes.push(`--${boundary}--`)
  return partes.join('\r\n')
}

// Envia un correo nuevo desde la cuenta conectada. El cuerpo es HTML
// (viene del editor con formato); adjuntos opcionales.
export async function enviarMailNuevo(input: {
  para: string
  asunto: string
  cuerpo: string
  adjuntos?: AdjuntoNuevo[]
}): Promise<{ ok?: boolean; error?: string }> {
  const { para, asunto, cuerpo, adjuntos = [] } = input
  if (!para.includes('@')) return { error: 'Destinatario inválido' }

  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }

  const html = cuerpo.includes('<') ? cuerpo : cuerpo.replace(/\n/g, '<br>')
  const mime = armarMime({ para, asunto, html, adjuntos })

  const res = await gmailFetch(token, `/messages/send`, {
    method: 'POST',
    body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }),
  })
  if (!res.ok) {
    const detail = await res.text()
    return { error: `Gmail respondió ${res.status}: ${detail.slice(0, 150)}` }
  }
  return { ok: true }
}

// Responde un mail manteniendo el hilo (threadId + In-Reply-To)
export async function responderMail(input: {
  threadId: string
  messageIdHeader: string
  para: string
  cc?: string
  asunto: string
  cuerpo: string
  adjuntos?: AdjuntoNuevo[]
}): Promise<{ ok?: boolean; error?: string }> {
  const { threadId, messageIdHeader, para, cc, asunto, cuerpo, adjuntos = [] } = input
  if (!para.includes('@')) return { error: 'Destinatario inválido' }

  const token = await getGoogleAccessToken()
  if (!token) return { error: NO_CONECTADO }

  const html = cuerpo.includes('<') ? cuerpo : cuerpo.replace(/\n/g, '<br>')
  const mime = armarMime({ para, cc, asunto, html, adjuntos, inReplyTo: messageIdHeader || undefined })

  const res = await gmailFetch(token, `/messages/send`, {
    method: 'POST',
    body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url'), threadId }),
  })
  if (!res.ok) {
    const detail = await res.text()
    return { error: `Gmail respondió ${res.status}: ${detail.slice(0, 150)}` }
  }
  return { ok: true }
}

export interface Contacto {
  nombre: string
  email: string
}

// Contactos derivados del propio historial (destinatarios de enviados y
// remitentes del inbox) — sin pedir permisos extra de Google. Cache 24h.
export async function getContactos(): Promise<{ contactos: Contacto[]; miEmail: string }> {
  const sb = createAdminClient()
  const CACHE_KEY = 'gmail_contactos_cache'

  const { data: cacheRow } = await sb.from('flujo_config').select('value').eq('key', CACHE_KEY).single()
  if (cacheRow?.value) {
    try {
      const cache = JSON.parse(cacheRow.value)
      if (Date.now() - new Date(cache.actualizadoAt).getTime() < 24 * 3600 * 1000) {
        return { contactos: cache.contactos, miEmail: cache.miEmail }
      }
    } catch {
      // recalcular
    }
  }

  const token = await getGoogleAccessToken()
  if (!token) return { contactos: [], miEmail: '' }

  const perfilRes = await gmailFetch(token, '/profile')
  const miEmail: string = perfilRes.ok ? (await perfilRes.json()).emailAddress ?? '' : ''

  const frecuencia = new Map<string, { nombre: string; email: string; usos: number }>()
  const registrar = (raw: string) => {
    for (const parte of raw.split(',')) {
      const { nombre, email } = parseFrom(parte.trim())
      const key = email.toLowerCase()
      if (!key.includes('@') || key === miEmail.toLowerCase()) continue
      const e = frecuencia.get(key)
      if (e) {
        e.usos++
        if (nombre !== email && e.nombre === e.email) e.nombre = nombre
      } else {
        frecuencia.set(key, { nombre, email: key, usos: 1 })
      }
    }
  }

  for (const q of ['in:sent', 'in:inbox']) {
    const listRes = await gmailFetch(token, `/messages?${new URLSearchParams({ maxResults: '100', q })}`)
    if (!listRes.ok) continue
    const ids: { id: string }[] = (await listRes.json()).messages ?? []
    for (let i = 0; i < ids.length; i += 20) {
      const batch = await Promise.all(
        ids.slice(i, i + 20).map(async ({ id }) => {
          const res = await gmailFetch(
            token,
            `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc`
          )
          if (!res.ok) return null
          const msg = await res.json()
          const headers: GmailHeader[] = msg.payload?.headers ?? []
          return q === 'in:sent'
            ? `${header(headers, 'To')},${header(headers, 'Cc')}`
            : header(headers, 'From')
        })
      )
      for (const raw of batch) if (raw) registrar(raw)
    }
  }

  const contactos = Array.from(frecuencia.values())
    .sort((a, b) => b.usos - a.usos)
    .slice(0, 300)
    .map(({ nombre, email }) => ({ nombre, email }))

  await sb.from('flujo_config').upsert({
    key: CACHE_KEY,
    value: JSON.stringify({ contactos, miEmail, actualizadoAt: new Date().toISOString() }),
    updated_at: new Date().toISOString(),
  })

  return { contactos, miEmail }
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
