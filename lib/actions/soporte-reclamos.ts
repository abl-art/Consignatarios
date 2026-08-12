'use server'

import { getGoogleAccessToken } from '@/lib/google'
import { createAdminClient } from '@/lib/supabase/admin'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const SOPORTE = 'gocuotasprod@cloud.trustonic.com'
const CACHE_KEY = 'soporte_reclamos_cache'
const CACHE_HORAS = 6

export interface CategoriaReclamo {
  categoria: string
  cantidad: number
  ejemplos: string[]
}

export interface ReclamosSoporte {
  total: number
  dias: number
  categorias: CategoriaReclamo[]
  actualizadoAt: string
}

// Categorias de reclamos por keywords — el primer match gana
const CATEGORIAS: { nombre: string; regex: RegExp }[] = [
  { nombre: 'Ya pagó y sigue bloqueado', regex: /(ll|y)a\s*(lo\s*)?(pagu|abon)|\bpagu[eé]\b|acredit\w*\s+(mi\s+)?pago|realic[eé] el pago|hice el pago/i },
  { nombre: 'Quiere pagar y no puede', regex: /(quiero|necesito|como|cómo|dónde|donde)\s+(pagar|abonar)|no\s+(me\s+deja|puedo)\s+(pagar|abonar)|pagar la (deuda|cuota)|link de pago/i },
  { nombre: 'No puede activar el equipo', regex: /activ/i },
  { nombre: 'Pide desbloqueo', regex: /desbloque/i },
  { nombre: 'Teléfono bloqueado / no puede usarlo', regex: /bloque|no\s+(me\s+deja|puedo)\s+(ingresar|entrar|usar|acceder)|no\s+(anda|funciona)/i },
  { nombre: 'Desconoce la compra o deuda', regex: /nunca\s+compr|no\s+compr[eé]|desconoc|estafa|no\s+ten(go|ía|ia)\s+(deuda|nada)/i },
  { nombre: 'Consulta cuotas / deuda / vencimiento', regex: /cuota|deuda|venc|saldo|cu[aá]nto\s+debo/i },
  { nombre: 'Pide solución / reclamo urgente', regex: /solucion|urgente|hace\s+(una|\d+)\s+horas?/i },
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

  const dias = 30
  const gm = (path: string) => fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` } })

  // Listar los mails de soporte del periodo (incluye papelera)
  const ids: string[] = []
  let pageToken: string | undefined
  while (ids.length < 300) {
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

  const categorias = Array.from(conteo.entries())
    .map(([categoria, v]) => ({ categoria, ...v }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5)

  const resultado: ReclamosSoporte = {
    total: ids.length,
    dias,
    categorias,
    actualizadoAt: new Date().toISOString(),
  }

  await sb.from('flujo_config').upsert({
    key: CACHE_KEY,
    value: JSON.stringify(resultado),
    updated_at: new Date().toISOString(),
  })

  return { data: resultado }
}
