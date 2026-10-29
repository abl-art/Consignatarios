import crypto from 'crypto'

export interface PurchaseLine {
  line_reference: string
  item_type: 'device' | 'addon'
  sku: string
  imeis?: string[]
  // Tablets (contrato 23/9/2026): device identificado por numero de serie — exactamente
  // uno de imeis/serials por linea, y serials solo con destination andreani_wh
  serials?: string[]
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

export type WholesaleResponseBody = {
  sale_id?: string
  proforma_number?: string
  result?: string
  fa_status?: string
  imeis_processed?: number
  request_id?: string
  dispatch?: { id: string; numero_orden_externa: string }
  warnings?: string[]
  error?: string
  details?: unknown
  code?: string
  retryable?: boolean
  errors?: unknown[]
}

export interface WholesaleResult {
  ok: boolean
  status: number
  body: WholesaleResponseBody | null
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

  if (Buffer.byteLength(rawBody, 'utf8') > 1_000_000) {
    return { ok: false, status: 0, body: { code: 'payload_too_large_local' }, retryable: false }
  }

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
        signal: AbortSignal.timeout(10000),
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

const WHOLESALE_URL = 'https://gocelular.gocuotas.com/api/webhooks/gocelular/wholesale'

export async function sendWholesaleWebhook(rawBody: string): Promise<WholesaleResult> {
  const secret = process.env.GOCELULAR_WEBHOOK_SECRET
  const url = process.env.GOCELULAR_WHOLESALE_URL || WHOLESALE_URL
  if (!secret) return { ok: false, status: 0, body: { code: 'secret_no_configurado' }, retryable: false }
  if (Buffer.byteLength(rawBody, 'utf8') > 1_000_000) {
    return { ok: false, status: 0, body: { code: 'payload_too_large_local' }, retryable: false }
  }
  let last: WholesaleResult = { ok: false, status: 0, body: null, retryable: true }
  for (let attempt = 0; attempt < 4; attempt++) {
    const ts = buildTimestamp()
    const sig = signWebhook(secret, ts, rawBody)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Gocelular-Signature': sig, 'X-Gocelular-Timestamp': ts },
        body: rawBody,
        // 45s: medido el 3/9 contra prod, un rechazo de negocio de GOcelular tarda ~30s en salir
        // (request_id 5b308cbe) — con 10s abortabamos antes de leer el 400 y lo reportabamos como
        // "HTTP 0 no respondio". Las pages que disparan esto ya tienen maxDuration=60.
        signal: AbortSignal.timeout(45000),
      })
      const body = (await res.json().catch(() => null)) as WholesaleResponseBody | null
      if (res.status === 200) return { ok: true, status: 200, body, retryable: false }
      const retryable = res.status >= 500
      last = { ok: false, status: res.status, body, retryable }
      if (!retryable) return last
    } catch (e) {
      // Timeout o red caida: reintentable, pero NUNCA en silencio — el detalle del error viaja en
      // body.error para que quede persistido en la proforma y en los logs de Vercel.
      const detalle = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      console.error(`sendWholesaleWebhook: intento ${attempt + 1}/4 sin respuesta — ${detalle}`)
      last = { ok: false, status: 0, body: { error: detalle }, retryable: true }
      // Un timeout de 45s no se reintenta en la misma invocacion: volveria a esperar 45s y se
      // comeria el maxDuration de la server action sin chances de exito.
      if (e instanceof Error && e.name === 'TimeoutError') break
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
  }
  return last
}

// ── API de cancelaciones del warehouse (contrato de Pedro, 27/10/2026) ──────

const CANCELACIONES_URL = 'https://gocelular.gocuotas.com/api/webhooks/gocelular/cancelaciones'

export interface RescateWebhook {
  estado?: string
  razon?: string | null
  tracking?: string | null
}

export interface DevolucionWebhook {
  estado?: string
  modalidad?: string | null
  tracking?: string | null
  etiqueta_url?: string | null
}

export interface ReembolsoWebhook {
  estado?: string
  monto?: number | null
  id_gocuotas?: string | null
}

export interface CancelacionResponse {
  resultado?: string
  estado?: string
  detalle?: string
  retryable?: boolean
  request_id?: string
  canal?: string | null
  code?: string
  message?: string
  reembolso?: ReembolsoWebhook | null
  rescate?: RescateWebhook | null
  devolucion?: DevolucionWebhook | null
  [k: string]: unknown
}

export interface CancelacionResult {
  ok: boolean
  status: number
  body: CancelacionResponse | null
}

/** POST preview/apply. Sin auto-reintentos: la regla de reintento (409/vivo) la decide quien llama. */
export async function sendCancelacionWebhook(payload: {
  mode: 'preview' | 'apply'
  accion: 'cancelar_pedido' | 'cancelar_orden' | 'solicitar_devolucion'
  order_number?: string
  proforma_number?: string
  motivo: string
  source: string
  // Solo solicitar_devolucion (Pedro rechaza campos desconocidos en las otras
  // acciones): armar el payload con construirPayloadCancelacion.
  modalidad?: 'domicilio' | 'sucursal'
  ventana?: { inicio: string; fin: string }
}): Promise<CancelacionResult> {
  const secret = process.env.GOCELULAR_WEBHOOK_SECRET
  const url = process.env.GOCELULAR_CANCELACIONES_URL || CANCELACIONES_URL
  if (!secret) return { ok: false, status: 0, body: { detalle: 'secret_no_configurado' } }
  const rawBody = JSON.stringify(payload)
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
      signal: AbortSignal.timeout(15000),
    })
    const body = (await res.json().catch(() => null)) as CancelacionResponse | null
    return { ok: res.status === 200, status: res.status, body }
  } catch {
    return { ok: false, status: 0, body: { detalle: 'sin_respuesta' } }
  }
}

/**
 * GET de la etiqueta PDF de la devolución. Firma distinta al GET de estado:
 * el material firmado es `timestamp + "." + order_number` (una firma sirve
 * para una sola orden); una firma con body vacío da 401.
 */
export async function getEtiquetaDevolucion(orderNumber: string): Promise<
  { ok: true; pdf: Buffer } | { ok: false; status: number; code: string }
> {
  const secret = process.env.GOCELULAR_WEBHOOK_SECRET
  const base = process.env.GOCELULAR_CANCELACIONES_URL || CANCELACIONES_URL
  if (!secret) return { ok: false, status: 0, code: 'secret_no_configurado' }
  const ts = buildTimestamp()
  const sig = signWebhook(secret, ts, orderNumber)
  try {
    const res = await fetch(`${base}/etiqueta?order_number=${encodeURIComponent(orderNumber)}`, {
      headers: { 'X-Gocelular-Signature': sig, 'X-Gocelular-Timestamp': ts },
      signal: AbortSignal.timeout(15000),
    })
    if (res.status === 200) return { ok: true, pdf: Buffer.from(await res.arrayBuffer()) }
    const body = (await res.json().catch(() => null)) as { code?: string } | null
    return { ok: false, status: res.status, code: body?.code ?? `http_${res.status}` }
  } catch {
    return { ok: false, status: 0, code: 'sin_respuesta' }
  }
}

/** GET del estado de la cancelación (el apply es asincrónico, ~1 min). La firma del GET es timestamp + ".". timeoutMs corto (5s) para los GET por fila de las pestañas. */
export async function getCancelacionEstado(
  query: { order_number?: string; proforma_number?: string },
  opts?: { timeoutMs?: number },
): Promise<CancelacionResult> {
  const secret = process.env.GOCELULAR_WEBHOOK_SECRET
  const base = process.env.GOCELULAR_CANCELACIONES_URL || CANCELACIONES_URL
  if (!secret) return { ok: false, status: 0, body: { detalle: 'secret_no_configurado' } }
  const params = new URLSearchParams()
  if (query.order_number) params.set('order_number', query.order_number)
  if (query.proforma_number) params.set('proforma_number', query.proforma_number)
  const ts = buildTimestamp()
  const sig = signWebhook(secret, ts, '')
  try {
    const res = await fetch(`${base}?${params.toString()}`, {
      headers: { 'X-Gocelular-Signature': sig, 'X-Gocelular-Timestamp': ts },
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 10000),
    })
    const body = (await res.json().catch(() => null)) as CancelacionResponse | null
    return { ok: res.status === 200, status: res.status, body }
  } catch {
    return { ok: false, status: 0, body: { detalle: 'sin_respuesta' } }
  }
}
