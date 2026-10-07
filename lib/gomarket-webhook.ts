import { signWebhook, buildTimestamp } from '@/lib/gocelular-webhook'
import type { CommercePurchaseLine, CommerceSupplier } from '@/lib/gomarket-purchase'

// Webhook de compras de GOmarket (Commerce v1 de GOcelular). Contrato según las
// novedades de Pedro del 22 sep 2026 + 30/9 + 7/10: storefront "go-market",
// destination, purchase_ref único por compra y una línea por SKU. `mode` es
// OBLIGATORIO en toda llamada ('validate' = dry run sin escribir, 'apply' =
// envío real; sin default — omitirlo rebota 400 invalid_payload path mode,
// novedad del 30/9). `supplier` opcional {name, cuit} registra el proveedor en
// el lote (novedad del 7/10). Secret PROPIO, distinto del de los webhooks
// GOcelular (GOMARKET_WEBHOOK_SECRET). La firma es la misma HMAC-SHA256 sobre
// `${timestamp}.${rawBody}` en hex, pero los headers son PROPIOS:
// X-Commerce-Signature, X-Commerce-Timestamp e Idempotency-Key — con los
// X-Gocelular-* responde 401. El apply está habilitado desde el 7/10.

export interface CommercePurchasePayload {
  storefront: 'go-market'
  destination: string
  purchase_ref: string
  supplier?: CommerceSupplier
  lines: CommercePurchaseLine[]
  mode: 'validate' | 'apply'
}

export type CommerceResponseBody = {
  result?: string
  request_id?: string
  purchase_id?: string
  warnings?: string[]
  code?: string
  error?: string
  retryable?: boolean
  errors?: { path?: string; sku?: string; [k: string]: unknown }[]
}

export interface CommerceResult {
  ok: boolean
  status: number
  body: CommerceResponseBody | null
  retryable: boolean
}

const DEFAULT_URL = 'https://gocelular.gocuotas.com/api/webhooks/commerce/v1/purchases'

export async function sendCommercePurchaseWebhook(payload: CommercePurchasePayload): Promise<CommerceResult> {
  const secret = process.env.GOMARKET_WEBHOOK_SECRET
  const url = process.env.GOMARKET_WEBHOOK_URL || DEFAULT_URL
  if (!secret) {
    return { ok: false, status: 0, body: { code: 'secret_no_configurado' }, retryable: false }
  }

  // Serializar UNA sola vez: el raw body firmado es el que viaja, byte a byte.
  const rawBody = JSON.stringify(payload)
  if (Buffer.byteLength(rawBody, 'utf8') > 1_000_000) {
    return { ok: false, status: 0, body: { code: 'payload_too_large_local' }, retryable: false }
  }

  // Idempotency-Key por compra: los reintentos de la misma compra comparten la
  // clave; el validate usa una clave propia para no pisar la del apply real
  const idempotencyKey = payload.mode === 'validate' ? `validate-${payload.purchase_ref}` : payload.purchase_ref

  let last: CommerceResult = { ok: false, status: 0, body: null, retryable: true }
  for (let attempt = 0; attempt < 4; attempt++) {
    const ts = buildTimestamp()
    const sig = signWebhook(secret, ts, rawBody)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Commerce-Signature': sig,
          'X-Commerce-Timestamp': ts,
          'Idempotency-Key': idempotencyKey,
        },
        body: rawBody,
        // Un rechazo de negocio de GOcelular puede tardar ~30s (medido en wholesale)
        signal: AbortSignal.timeout(45000),
      })
      const body = (await res.json().catch(() => null)) as CommerceResponseBody | null
      if (res.status === 200) return { ok: true, status: 200, body, retryable: false }
      const retryable = res.status >= 500
      last = { ok: false, status: res.status, body, retryable }
      if (!retryable) return last
    } catch (e) {
      const detalle = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      console.error(`sendCommercePurchaseWebhook: intento ${attempt + 1}/4 sin respuesta — ${detalle}`)
      last = { ok: false, status: 0, body: { error: detalle }, retryable: true }
      // Un timeout de 45s no se reintenta en la misma invocación (agotaría el maxDuration)
      if (e instanceof Error && e.name === 'TimeoutError') break
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
  }
  return last
}
