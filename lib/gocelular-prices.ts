// Cliente de la API de precios de la tienda GOcelular (doc de Pedro, ago 2026):
//   GET  /api/webhooks/gocelular/prices              → catálogo con identidad canónica
//   POST /api/webhooks/gocelular/prices mode:preview → mismas validaciones que apply, sin escribir
//   POST /api/webhooks/gocelular/prices mode:apply   → batch atómico todo-o-nada, idempotente
//
// Misma auth HMAC dual-secret que compras/mayorista (signWebhook) y mismo
// formato de montos: pesos string decimal con 2 decimales ("1205100.00").
// Compare-and-set: cada línea viaja con expected_slug + expected_price leídos
// del GET; si algo cambió del lado de la tienda la lista entera rebota (409).

import { signWebhook, buildTimestamp } from './gocelular-webhook'
import { normalizarModelo } from './inventario-indicadores'
import type { FilaListaPrecios } from './lista-precios'

const PRICES_URL = 'https://gocelular.gocuotas.com/api/webhooks/gocelular/prices'

export interface CatalogoProducto {
  store_product_id: string
  slug: string
  display_name: string
  brand: string | null
  model_code: string | null
  skus: string[]
  status: 'draft' | 'active'
  price: string
  compare_at_price: string | null
  reference_installments: number
  installment: string
  headroom: number
}

export interface CatalogoRespuesta {
  result?: string
  request_id?: string
  generated_at?: string
  max_delta_pct?: number
  products?: CatalogoProducto[]
  code?: string
  errors?: unknown[]
}

export interface LineaPrecio {
  store_product_id: string
  expected_slug: string
  expected_price: string
  new_price: string
}

export interface PricesPayload {
  batch_reference: string
  mode: 'preview' | 'apply'
  source: string
  timestamp: string
  lines: LineaPrecio[]
}

export interface LineaRespuesta {
  path?: string
  store_product_id?: string
  slug?: string
  display_name?: string
  status?: string
  current_price?: string
  previous_price?: string
  new_price?: string
  delta_pct?: number
  installment_current?: string
  installment_new?: string
  headroom?: number
  warnings?: string[]
}

export interface PricesRespuesta {
  result?: string
  code?: string
  request_id?: string
  original_request_id?: string
  batch_reference?: string
  applied_at?: string
  retryable?: boolean
  summary?: { lines?: number; would_update?: number; updated?: number; unchanged?: number; warnings?: number }
  lines?: LineaRespuesta[]
  errors?: { path?: string; code?: string; store_product_id?: string; [k: string]: unknown }[]
}

export interface PricesResult {
  ok: boolean
  status: number
  body: PricesRespuesta | null
  retryable: boolean
}

/** Pesos como string decimal, 2 decimales, punto, sin miles: 1205100 → "1205100.00" */
export function formatearPesos(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

export interface MapeoTienda {
  fila: FilaListaPrecios
  producto: CatalogoProducto
}

/**
 * Cruza las filas de la Lista de Precios contra el catálogo de la tienda:
 * primero por codigo == model_code (exacto, inmune a renames), después por
 * nombre normalizado. Cada producto de tienda acepta una sola fila; lo que no
 * matchea queda en sinMapear para mostrarlo (no se publica a ciegas).
 */
export function mapearProductosTienda(
  filas: FilaListaPrecios[],
  catalogo: CatalogoProducto[],
): { mapeadas: MapeoTienda[]; sinMapear: FilaListaPrecios[] } {
  const porCodigo = new Map<string, CatalogoProducto>()
  const porNombre = new Map<string, CatalogoProducto>()
  for (const p of catalogo) {
    if (p.model_code && !porCodigo.has(p.model_code)) porCodigo.set(p.model_code, p)
    const clave = normalizarModelo(p.display_name)
    if (!porNombre.has(clave)) porNombre.set(clave, p)
  }

  const usados = new Set<string>()
  const mapeadas: MapeoTienda[] = []
  const sinMapear: FilaListaPrecios[] = []
  for (const fila of filas) {
    const producto =
      (fila.codigo ? porCodigo.get(fila.codigo) : undefined) ??
      porNombre.get(normalizarModelo(fila.nombre))
    if (producto && !usados.has(producto.store_product_id)) {
      usados.add(producto.store_product_id)
      mapeadas.push({ fila, producto })
    } else {
      sinMapear.push(fila)
    }
  }
  return { mapeadas, sinMapear }
}

/**
 * Arma las líneas del batch: expected_* tal cual vino el catálogo (el string
 * de price viaja sin re-formatear) y new_price = PVP vigente de la lista (con
 * bono si hay). Filas sin PVP calculable quedan excluidas y reportadas.
 */
export function armarLineasPrecios(
  mapeadas: MapeoTienda[],
): { lineas: LineaPrecio[]; excluidas: FilaListaPrecios[] } {
  const lineas: LineaPrecio[] = []
  const excluidas: FilaListaPrecios[] = []
  for (const { fila, producto } of mapeadas) {
    const pvpVigente = fila.pvpConBono ?? fila.pvp
    if (pvpVigente === null) {
      excluidas.push(fila)
      continue
    }
    lineas.push({
      store_product_id: producto.store_product_id,
      expected_slug: producto.slug,
      expected_price: producto.price,
      new_price: formatearPesos(pvpVigente),
    })
  }
  return { lineas, excluidas }
}

function pricesUrl(): string {
  return process.env.GOCELULAR_PRICES_URL || PRICES_URL
}

/** GET catálogo firmado (body vacío: se firma `timestamp + "."`). */
export async function fetchCatalogoPrecios(): Promise<{ ok: boolean; status: number; body: CatalogoRespuesta | null }> {
  const secret = process.env.GOCELULAR_WEBHOOK_SECRET
  if (!secret) return { ok: false, status: 0, body: { code: 'secret_no_configurado' } }

  let last = { ok: false, status: 0, body: null as CatalogoRespuesta | null }
  for (let attempt = 0; attempt < 3; attempt++) {
    const ts = buildTimestamp()
    try {
      const res = await fetch(pricesUrl(), {
        headers: {
          'X-Gocelular-Signature': signWebhook(secret, ts, ''),
          'X-Gocelular-Timestamp': ts,
        },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      })
      const body = (await res.json().catch(() => null)) as CatalogoRespuesta | null
      if (res.status === 200) return { ok: true, status: 200, body }
      last = { ok: false, status: res.status, body }
      if (res.status < 500) return last
    } catch {
      last = { ok: false, status: 0, body: null }
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
  }
  return last
}

/**
 * POST preview/apply. Reintenta red caída y 5xx (backoff 2s/4s, máx 3 intentos)
 * — el retry del apply es seguro por idempotencia (misma batch_reference y
 * contenido → replay). El 503 integration_disabled NO se reintenta acá: se
 * devuelve al caller, que durante la fase de integración lo espera.
 */
export async function enviarListaPrecios(payload: PricesPayload): Promise<PricesResult> {
  const secret = process.env.GOCELULAR_WEBHOOK_SECRET
  if (!secret) return { ok: false, status: 0, body: { code: 'secret_no_configurado' }, retryable: false }

  const rawBody = JSON.stringify(payload)
  if (Buffer.byteLength(rawBody, 'utf8') > 1_000_000) {
    return { ok: false, status: 0, body: { code: 'payload_too_large_local' }, retryable: false }
  }

  let last: PricesResult = { ok: false, status: 0, body: null, retryable: true }
  for (let attempt = 0; attempt < 3; attempt++) {
    const ts = buildTimestamp()
    const sig = signWebhook(secret, ts, rawBody)
    try {
      const res = await fetch(pricesUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gocelular-Signature': sig,
          'X-Gocelular-Timestamp': ts,
        },
        body: rawBody,
        signal: AbortSignal.timeout(15000),
      })
      const body = (await res.json().catch(() => null)) as PricesRespuesta | null
      if (res.status === 200) return { ok: true, status: 200, body, retryable: false }
      const retryable = res.status >= 500
      last = { ok: false, status: res.status, body, retryable }
      if (!retryable || res.status === 503) return last
    } catch {
      last = { ok: false, status: 0, body: null, retryable: true }
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
  }
  return last
}
