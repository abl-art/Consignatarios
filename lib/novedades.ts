import crypto from 'crypto'

// Novedades de GOcelular: Pedro informa cambios de su sistema (schema, features,
// avisos) via webhook entrante y se muestran en la cajita del Dashboard 360.

export interface NovedadEntrante {
  titulo: string
  detalle: string | null
  tipo: string | null
  referencia: string | null
}

const MAX_SKEW_MS = 5 * 60 * 1000
const MAX_NOVEDADES_POR_POST = 50

// Misma convención que los webhooks salientes (lib/gocelular-webhook.ts):
// HMAC-SHA256 de `${timestamp}.${rawBody}` con el secret compartido.
export function verificarFirmaNovedades(
  secret: string,
  timestampIso: string,
  rawBody: string,
  firma: string,
  ahora: Date = new Date(),
): { ok: boolean; error?: string } {
  const ts = Date.parse(timestampIso)
  if (Number.isNaN(ts)) return { ok: false, error: 'timestamp_invalido' }
  if (Math.abs(ahora.getTime() - ts) > MAX_SKEW_MS) return { ok: false, error: 'timestamp_vencido' }
  const esperada = crypto.createHmac('sha256', secret).update(`${timestampIso}.${rawBody}`).digest('hex')
  const a = Buffer.from(esperada, 'utf8')
  const b = Buffer.from(firma || '', 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: 'firma_invalida' }
  return { ok: true }
}

// Acepta una novedad suelta o un batch { novedades: [...] }
export function parseNovedades(body: unknown): { ok: true; novedades: NovedadEntrante[] } | { ok: false; error: string } {
  const items: unknown[] = Array.isArray((body as { novedades?: unknown[] })?.novedades)
    ? (body as { novedades: unknown[] }).novedades
    : [body]
  if (items.length === 0) return { ok: false, error: 'sin_novedades' }
  if (items.length > MAX_NOVEDADES_POR_POST) return { ok: false, error: 'demasiadas_novedades' }

  const novedades: NovedadEntrante[] = []
  for (const item of items) {
    const n = item as Record<string, unknown>
    if (!n || typeof n.titulo !== 'string' || n.titulo.trim() === '') {
      return { ok: false, error: 'titulo_requerido' }
    }
    const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.slice(0, 2000) : null)
    novedades.push({
      titulo: n.titulo.trim().slice(0, 300),
      detalle: str(n.detalle),
      tipo: str(n.tipo)?.slice(0, 50) ?? null,
      referencia: str(n.referencia)?.slice(0, 200) ?? null,
    })
  }
  return { ok: true, novedades }
}
