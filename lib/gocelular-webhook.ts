import crypto from 'crypto'

export interface PurchaseLine {
  line_reference: string
  item_type: 'device' | 'addon'
  sku: string
  imeis?: string[]
  quantity?: number
  unit_cost?: string
  description?: string
  ean?: string
}

export interface PurchasePayload {
  purchase_reference: string
  supplier: string
  destination: 'andreani_wh' | 'local'
  lines: PurchaseLine[]
  timestamp: string
}

export type PurchaseResponseBody = {
  result?: string
  request_id?: string
  purchase_id?: string
  batches?: { type: string; batch_id: string; lines: number; units: number }[]
  lineas_pendientes_alias?: { line_reference: string; sku: string }[]
  warnings?: string[]
  code?: string
  retryable?: boolean
  errors?: { path?: string; line_reference?: string; sku?: string; [k: string]: unknown }[]
}

export interface PurchaseResult {
  ok: boolean
  status: number
  body: PurchaseResponseBody | null
  retryable: boolean
}

export function signWebhook(secret: string, timestampIso: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestampIso}.${rawBody}`).digest('hex')
}

// ISO-8601 con offset -03:00 (Argentina), sin milisegundos
export function buildTimestamp(now: Date = new Date()): string {
  const ar = new Date(now.getTime() - 3 * 3600000)
  return ar.toISOString().slice(0, 19) + '-03:00'
}

const DEFAULT_URL = 'https://gocelular.gocuotas.com/api/webhooks/gocelular/purchase'

export async function sendPurchaseWebhook(payload: PurchasePayload): Promise<PurchaseResult> {
  const secret = process.env.GOCELULAR_WEBHOOK_SECRET
  const url = process.env.GOCELULAR_WEBHOOK_URL || DEFAULT_URL
  if (!secret) {
    return { ok: false, status: 0, body: { code: 'secret_no_configurado' }, retryable: false }
  }

  // Serializar UNA sola vez: el raw body firmado es el que viaja, byte a byte.
  const rawBody = JSON.stringify(payload)

  let last: PurchaseResult = { ok: false, status: 0, body: null, retryable: true }
  for (let attempt = 0; attempt < 4; attempt++) {
    // Headers de auth frescos en cada intento; body identico.
    const ts = buildTimestamp()
    const sig = signWebhook(secret, ts, rawBody)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gocelular-Signature': sig,
          'X-Gocelular-Timestamp': ts,
        },
        body: rawBody,
        signal: AbortSignal.timeout(30000),
      })
      const body = (await res.json().catch(() => null)) as PurchaseResponseBody | null

      if (res.status === 200) return { ok: true, status: 200, body, retryable: false }

      const retryable = res.status >= 500
      last = { ok: false, status: res.status, body, retryable }
      if (!retryable) return last
    } catch {
      // Timeout o red caida ("sin respuesta" segun retry policy de GOcelular): reintentable
      last = { ok: false, status: 0, body: null, retryable: true }
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
  }
  return last
}
