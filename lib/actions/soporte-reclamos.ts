'use server'

import { getGoogleAccessToken } from '@/lib/google'
import { createAdminClient } from '@/lib/supabase/admin'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const SOPORTE = 'gocuotasprod@cloud.trustonic.com'
const CACHE_KEY = 'soporte_reclamos_cache_v2'
const CACHE_HORAS = 6
const DIAS = 60
const MAX_MAILS = 500
const TOP = 10

export interface CategoriaReclamo {
  categoria: string
  cantidad: number
  ejemplos: string[]
}

export interface ReclamosSoporte {
  total: number
  dias: number
  categorias: CategoriaReclamo[]
  otros: number
  sinComentario: number
  actualizadoAt: string
}

// Categorias de reclamos por keywords — el primer match gana.
// Afinadas contra 500 mails reales de 60 dias (ago 2026).
const CATEGORIAS: { nombre: string; regex: RegExp }[] = [
  { nombre: 'Ya pagó y sigue bloqueado', regex: /(ll|y)a\s*(lo\s*)?(pagu|abon|realic|ise el pago|hice el pago)|\bpagu[eé]\b|ya\s+(le\s+)?pagamos|equipo ya est[aá] pago/i },
  { nombre: 'Informa un pago / pide confirmación', regex: /transferenc|transfer[ií]|comprobante|confirmar\s+(el\s+)?pago|informar\s+(un\s+)?pago|lleg[oó]\s+(mi|el)\s+pago|actualizar\s+pago|acredit/i },
  { nombre: 'Pide alta / habilitación del equipo', regex: /\balta\b|h?abilit|avili|abilit/i },
  { nombre: 'Pide prórroga / cambiar fecha de pago', regex: /pr[oó]rroga|promesa de pago|plan de pago|cambiar.{0,20}fecha|fecha de pago|cobro el\b|no\s+(pude\s+)?cobr[eé]?|todav[ií]a no cobr|semana que viene|mes que viene|d[ií]as m[aá]s|plazo|atras[eé]/i },
  { nombre: 'Quiere pagar / cómo pagar', regex: /(quiero|necesito|como|cómo|dónde|donde)\s+(hacer\s+(mi|el)\s+pago|pagar|abonar)|no\s+(me\s+deja|puedo)\s+(pagar|abonar|realizar el pago)|pagar la (deuda|cuota)|link de pago|pagar con|rapi\s?pago|d[eé]bito|quiero hacer mi pago|tengo que pagar|qu[ií]ero pagar/i },
  { nombre: 'Pide desbloqueo', regex: /desbloque/i },
  { nombre: 'No puede activar el equipo', regex: /activ/i },
  { nombre: 'Falla del equipo (pantalla / lento)', regex: /falla|se tilda|tildad|se traba|pantalla|anda mal|lento/i },
  { nombre: 'Pide sacar la app (equipo pago)', regex: /sacar\w*\s?(de\s)?(esta?|esa|la)\s+aplicaci|desinstal|me puede sacar/i },
  { nombre: 'Nadie lo atiende / pide contacto', regex: /no\s+(me\s+)?(atienden|responden|contestan)|respuesta|asesor|comunicar|contactar|n[uú]mero para|llam[oó]\s+(al|y|con|muchas)/i },
  { nombre: 'Teléfono bloqueado / no puede usarlo', regex: /bloque|blokio|no\s+(me\s+deja|puedo)\s+(ingresar|entrar|usar|acceder|hacer|abrir|salir)|no\s+(anda|funciona)|me cortaron|dieron de baja|no lo puedo usar/i },
  { nombre: 'Problemas de cuenta / billetera', regex: /entrar a mi cuenta|billetera|cambi\w*\s+(el\s+|mi\s+)?(gmail|n[uú]mero|correo)|mis contactos/i },
  { nombre: 'Desconoce la compra o deuda', regex: /nunca\s+compr|no\s+compr[eé]|desconoc|estafa|no\s+ten(go|ía|ia)\s+(deuda|nada)|no sab[ií]a que|no s[eé] qu[eé].{0,15}cobra|lo compr[oó] otra persona/i },
  { nombre: 'Consulta cuotas / deuda / monto', regex: /cuota|deuda|venc|saldo|cu[aá]nto\s+(debo|es el monto)|monto|factura/i },
  { nombre: 'Pide solución / reclamo urgente', regex: /soluci|urgente|hace\s+(una|\d+)\s+horas?|falta de respeto|ya{2,}/i },
]

// Saludos sin contenido real
const SOLO_SALUDO = /^(hola|buen(as|os)?\s*(tardes|noches|d[ií]as)?)[\s!.,]*$/i

function extraerReclamo(cuerpo: string): string {
  // El texto libre del cliente viene despues de los campos estructurados
  const limpio = cuerpo
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const lineas = limpio
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  const esCampo = (l: string) =>
    /^(tenant id|device imei|device tac|device state|next checkin|last checkin|custom properties|organization name)/i.test(l)
  const libres = lineas.filter(l => !esCampo(l))
  return libres.join(' ').replace(/\s+/g, ' ').replace(/"/g, '').trim()
}

function categorizar(reclamo: string): string {
  if (!reclamo || reclamo.length < 4 || SOLO_SALUDO.test(reclamo)) return 'Sin comentario del cliente'
  for (const c of CATEGORIAS) {
    if (c.regex.test(reclamo)) return c.nombre
  }
  return 'Otros'
}

export async function getReclamosSoporte(forzar = false): Promise<{ data?: ReclamosSoporte; error?: string }> {
  const sb = createAdminClient()

  if (!forzar) {
    const { data: cache } = await sb.from('flujo_config').select('value').eq('key', CACHE_KEY).single()
    if (cache?.value) {
      try {
        const parsed = JSON.parse(cache.value) as ReclamosSoporte
        const edadHoras = (Date.now() - new Date(parsed.actualizadoAt).getTime()) / 3600000
        if (edadHoras < CACHE_HORAS) return { data: parsed }
      } catch {
        // cache invalida: recalcular
      }
    }
  }

  const token = await getGoogleAccessToken()
  if (!token) return { error: 'Google no conectado' }

  const dias = DIAS
  const gm = (path: string) => fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` } })

  // Listar los mails de soporte del periodo (incluye papelera)
  const ids: string[] = []
  let pageToken: string | undefined
  while (ids.length < MAX_MAILS) {
    const params = new URLSearchParams({
      maxResults: '100',
      q: `in:anywhere from:${SOPORTE} newer_than:${dias}d`,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await gm(`/messages?${params}`)
    if (!res.ok) return { error: `Gmail respondió ${res.status}` }
    const data = await res.json()
    ids.push(...((data.messages ?? []) as { id: string }[]).map(m => m.id))
    pageToken = data.nextPageToken
    if (!pageToken) break
  }

  const conteo = new Map<string, { cantidad: number; ejemplos: string[] }>()
  for (let i = 0; i < ids.length; i += 20) {
    const batch = await Promise.all(
      ids.slice(i, i + 20).map(async id => {
        const res = await gm(`/messages/${id}?format=full`)
        if (!res.ok) return null
        const msg = await res.json()
        let cuerpo = ''
        const walk = (p: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }) => {
          if ((p.mimeType === 'text/plain' || p.mimeType === 'text/html') && p.body?.data && !cuerpo) {
            cuerpo = Buffer.from(p.body.data, 'base64url').toString('utf8')
          }
          for (const child of (p.parts ?? []) as { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[]) walk(child)
        }
        walk(msg.payload ?? {})
        return extraerReclamo(cuerpo)
      })
    )
    for (const reclamo of batch) {
      if (reclamo === null) continue
      const cat = categorizar(reclamo)
      const e = conteo.get(cat) ?? { cantidad: 0, ejemplos: [] }
      e.cantidad++
      if (reclamo && e.ejemplos.length < 3 && cat !== 'Sin comentario del cliente') {
        e.ejemplos.push(reclamo.slice(0, 90))
      }
      conteo.set(cat, e)
    }
  }

  // Otros y Sin comentario van aparte: el top solo muestra categorias accionables
  const otros = conteo.get('Otros')?.cantidad ?? 0
  const sinComentario = conteo.get('Sin comentario del cliente')?.cantidad ?? 0
  const categorias = Array.from(conteo.entries())
    .filter(([categoria]) => categoria !== 'Otros' && categoria !== 'Sin comentario del cliente')
    .map(([categoria, v]) => ({ categoria, ...v }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, TOP)

  const resultado: ReclamosSoporte = {
    total: ids.length,
    dias,
    categorias,
    otros,
    sinComentario,
    actualizadoAt: new Date().toISOString(),
  }

  await sb.from('flujo_config').upsert({
    key: CACHE_KEY,
    value: JSON.stringify(resultado),
    updated_at: new Date().toISOString(),
  })

  return { data: resultado }
}
