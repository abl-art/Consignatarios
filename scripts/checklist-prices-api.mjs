// Checklist de integración de la API de precios de GOcelular (doc de Pedro,
// sección "Probar tu integración antes del primer apply"). Todo inofensivo:
// GET y preview no escriben, y el apply está deshabilitado (503) hasta que
// Pedro habilite. Correr con: node scripts/checklist-prices-api.mjs
import crypto from 'node:crypto'
import fs from 'node:fs'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
const getEnv = (k) => {
  const l = env.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : null
}
const SECRET = getEnv('GOCELULAR_WEBHOOK_SECRET')
const URL_ = getEnv('GOCELULAR_PRICES_URL') || 'https://gocelular.gocuotas.com/api/webhooks/gocelular/prices'
if (!SECRET) { console.error('Falta GOCELULAR_WEBHOOK_SECRET'); process.exit(1) }

const sign = (secret, ts, rawBody) => crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
const buildTs = (offsetMs = 0) => new Date(Date.now() - 3 * 3600000 + offsetMs).toISOString().slice(0, 19) + '-03:00'

async function call({ method = 'GET', body = null, ts = buildTs(), sig = undefined, headers = true }) {
  const rawBody = body === null ? '' : JSON.stringify(body)
  const h = { 'Content-Type': 'application/json' }
  if (headers) {
    h['X-Gocelular-Signature'] = sig ?? sign(SECRET, ts, rawBody)
    h['X-Gocelular-Timestamp'] = ts
  }
  const res = await fetch(URL_, { method, headers: h, ...(body !== null ? { body: rawBody } : {}) })
  const json = await res.json().catch(() => null)
  return { status: res.status, body: json }
}

const resultados = []
const check = (nombre, cond, detalle = '') => {
  resultados.push({ nombre, ok: !!cond, detalle })
  console.log(`${cond ? '✅' : '❌'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

const hoy = new Date().toISOString().slice(0, 10)
const ref = (n) => `CHK-${hoy}-${n}-${Date.now() % 100000}`
const payload = (mode, lines, extra = {}) => ({
  batch_reference: ref(mode), mode, source: 'consignacion-app', timestamp: buildTs(), lines, ...extra,
})
const linea = (p, over = {}) => ({
  store_product_id: p.store_product_id, expected_slug: p.slug, expected_price: p.price, new_price: p.price, ...over,
})
// new_price con delta chico y válido (−5%, 2 decimales)
const menos5 = (price) => (Math.round(Number(price) * 0.95 * 100) / 100).toFixed(2)

// ── 1. Auth en verde y en rojo ──────────────────────────────────────────────
let cat = await call({})
check('1a GET firmado → 200', cat.status === 200, `status ${cat.status}`)
let r = await call({ headers: false })
check('1b sin headers → 401', r.status === 401, `status ${r.status}`)
r = await call({ sig: sign(SECRET, buildTs(), 'otro-body') })
check('1c firma sobre otro body → 401', r.status === 401, `status ${r.status}`)
r = await call({ ts: buildTs(-10 * 60000) })
check('1d timestamp de hace 10 min → 401', r.status === 401, `status ${r.status}`)

if (cat.status !== 200) { console.error('Sin catálogo no se puede seguir.'); process.exit(1) }
const prods = cat.body.products ?? []

// ── 2. Catálogo ─────────────────────────────────────────────────────────────
const bien = prods.every((p) => p.store_product_id && p.slug && typeof p.price === 'string')
check('2 catálogo con id + slug + price en cada producto', bien && prods.length > 0,
  `${prods.length} productos, max_delta_pct ${cat.body.max_delta_pct}`)
const p1 = prods[0], p2 = prods[1] ?? prods[0]

// ── 3. Preview feliz ────────────────────────────────────────────────────────
r = await call({ method: 'POST', body: payload('preview', [linea(p1, { new_price: menos5(p1.price) })]) })
const l0 = r.body?.lines?.[0]
check('3 preview feliz → 200 result:preview con delta_pct',
  r.status === 200 && r.body?.result === 'preview' && l0?.status === 'would_update' && typeof l0?.delta_pct === 'number',
  `status ${r.status}, line status ${l0?.status}, delta ${l0?.delta_pct}%`)

// ── 4. Cada error, provocado a propósito ───────────────────────────────────
r = await call({ method: 'POST', body: payload('preview', [linea({ ...p1, store_product_id: crypto.randomUUID() })]) })
check('4a UUID inventado → 400 product_desconocido', r.status === 400 && r.body?.code === 'product_desconocido', `${r.status} ${r.body?.code}`)
r = await call({ method: 'POST', body: payload('preview', [linea(p1, { expected_slug: p2.slug === p1.slug ? 'slug-de-otro' : p2.slug })]) })
check('4b slug de otro producto → 409 product_mismatch', r.status === 409 && r.body?.code === 'product_mismatch', `${r.status} ${r.body?.code}`)
r = await call({ method: 'POST', body: payload('preview', [linea(p1, { expected_price: (Number(p1.price) - 1).toFixed(2) })]) })
const drift = r.body?.errors?.[0]
check('4c expected_price viejo → 409 price_drift con current_price',
  r.status === 409 && r.body?.code === 'price_drift' && drift?.current_price === p1.price, `${r.status} ${r.body?.code}, current ${drift?.current_price}`)
r = await call({ method: 'POST', body: payload('preview', [linea(p1, { new_price: (Number(p1.price) * 2).toFixed(2) })]) })
const exc = r.body?.errors?.[0]
check('4d new_price al doble → 400 price_delta_exceeded con delta y tope',
  r.status === 400 && r.body?.code === 'price_delta_exceeded' && exc?.delta_pct !== undefined && exc?.max_delta_pct !== undefined,
  `${r.status} ${r.body?.code}, delta ${exc?.delta_pct} max ${exc?.max_delta_pct}`)
r = await call({ method: 'POST', body: payload('preview', [linea(p1)], { campo_extra: 1 }) })
const e4e = r.body?.errors?.[0]
// campo extra en la raíz → path "" (raíz) y el message nombra la key
check('4e campo extra → 400 invalid_payload señalando la key', r.status === 400 && r.body?.code === 'invalid_payload' && (e4e?.path || e4e?.message?.includes('campo_extra')), `${r.status} ${r.body?.code} ${e4e?.message ?? e4e?.path}`)
r = await call({ method: 'POST', body: payload('publish', [linea(p1)]) })
check('4f mode publish → 400 invalid_payload', r.status === 400 && r.body?.code === 'invalid_payload', `${r.status} ${r.body?.code}`)
r = await call({ method: 'POST', body: payload('preview', [linea(p1), linea(p1)]) })
check('4g producto repetido → 400 invalid_payload señalando la línea', r.status === 400 && r.body?.code === 'invalid_payload', `${r.status} ${r.body?.code} path ${r.body?.errors?.[0]?.path}`)

// ── 5. Batch atómico ────────────────────────────────────────────────────────
r = await call({ method: 'POST', body: payload('preview', [
  linea(p1, { new_price: menos5(p1.price) }),
  linea({ ...p2, store_product_id: crypto.randomUUID() }),
]) })
const soloRota = r.body?.errors?.length === 1 && r.body?.errors?.[0]?.path === 'lines[1]'
check('5 batch atómico: 1 buena + 1 rota → errors[] solo la rota, nada aplicado',
  r.status === 400 && soloRota, `${r.status}, errors ${JSON.stringify(r.body?.errors?.map(e => e.path))}`)

// ── 6. Warnings ─────────────────────────────────────────────────────────────
r = await call({ method: 'POST', body: payload('preview', [linea(p1)]) })
check('6a new_price igual al vigente → unchanged', r.status === 200 && r.body?.lines?.[0]?.status === 'unchanged', `line status ${r.body?.lines?.[0]?.status}`)
const sinStock = prods.find((p) => p.headroom <= 0)
if (sinStock) {
  r = await call({ method: 'POST', body: payload('preview', [linea(sinStock)]) })
  check('6b producto sin stock → warning no_headroom', r.status === 200 && r.body?.lines?.[0]?.warnings?.includes('no_headroom'), `warnings ${JSON.stringify(r.body?.lines?.[0]?.warnings)}`)
} else {
  check('6b producto sin stock → warning no_headroom', true, 'sin productos con headroom<=0 en el catálogo hoy — no verificable')
}

// ── 7. Apply bloqueado (fin del circuito) ───────────────────────────────────
r = await call({ method: 'POST', body: payload('apply', [linea(p1, { new_price: menos5(p1.price) })]) })
check('7 apply → 503 integration_disabled (fase de integración)', r.status === 503 && r.body?.code === 'integration_disabled', `${r.status} ${r.body?.code} retryable ${r.body?.retryable}`)

// ── Resumen ─────────────────────────────────────────────────────────────────
const okN = resultados.filter((x) => x.ok).length
console.log(`\n${okN}/${resultados.length} checks OK`)
process.exit(okN === resultados.length ? 0 : 1)
