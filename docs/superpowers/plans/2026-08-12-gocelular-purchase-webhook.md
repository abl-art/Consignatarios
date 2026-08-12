# GOcelular Purchase Webhook Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El gestor de compras informa cada compra a GOcelular vía su webhook HMAC (`/api/webhooks/gocelular/purchase`), con pre-validación contra las tablas de GOcelular antes de enviar.

**Architecture:** Cliente puro del webhook (`lib/gocelular-webhook.ts`) + parser de Excel de IMEIs (`lib/imei-excel-parser.ts`) + orquestador server action (`lib/actions/purchase-webhook.ts`) que valida contra la base externa de GOcelular y persiste el resultado en el `Pedido` (JSON en `flujo_config`). UI: selector de destino, chip de estado y botones de reintento en `GestorClient.tsx`.

**Tech Stack:** Next.js 14 server actions, `pg` (pool existente en `lib/db-pool.ts` vía `getPool()`), `xlsx` (ya instalado), vitest (ya configurado, tests en `__tests__/`), crypto nativo de Node.

**Spec:** `docs/superpowers/specs/2026-08-12-gocelular-purchase-webhook-design.md` — leerla antes de empezar.

## Global Constraints

- Los montos al webhook van como string decimal en pesos, regex `^\d+(\.\d{1,2})?$`, nunca centavos ni separador de miles.
- IMEIs: 15 dígitos con checksum Luhn válido, sin duplicados en todo el payload.
- Límites del endpoint: ≤ 200 líneas, ≤ 5000 unidades totales, ≤ $500.000.000 agregado, ≤ $100.000.000 por línea, hasta 1 MB de body.
- `device` exige `imeis` y prohíbe faltantes; `addon` exige `quantity` y `unit_cost` y prohíbe `imeis`.
- Reintentos HTTP solo ante timeout/5xx/503, backoff 2s/4s/8s, máx. 3 intentos; body idéntico, headers de auth recalculados en cada intento.
- El campo `timestamp` del body está excluido del hash de idempotencia (`canonicalHashV2`) — se puede regenerar en reintentos.
- Env vars: `GOCELULAR_WEBHOOK_SECRET` (sin default), `GOCELULAR_WEBHOOK_URL` (default `https://gocelular.gocuotas.com/api/webhooks/gocelular/purchase`).
- Convención del repo: `npx tsc --noEmit` debe pasar antes de cada commit; tests con `npm test`.
- Textos de UI y mensajes de error en español (es-AR, voseo).

---

### Task 1: Cliente puro del webhook — `lib/gocelular-webhook.ts`

**Files:**
- Create: `lib/gocelular-webhook.ts`
- Test: `__tests__/gocelular-webhook.test.ts`

**Interfaces:**
- Consumes: nada del repo (solo `crypto` de Node y `fetch` global).
- Produces (usadas por Task 4):
  - `interface PurchaseLine { line_reference: string; item_type: 'device' | 'addon'; sku: string; imeis?: string[]; quantity?: number; unit_cost?: string; description?: string; ean?: string }`
  - `interface PurchasePayload { purchase_reference: string; supplier: string; destination: 'andreani_wh' | 'local'; lines: PurchaseLine[]; timestamp: string }`
  - `interface PurchaseResult { ok: boolean; status: number; body: PurchaseResponseBody | null; retryable: boolean }`
  - `type PurchaseResponseBody = { result?: string; request_id?: string; purchase_id?: string; batches?: { type: string; batch_id: string; lines: number; units: number }[]; lineas_pendientes_alias?: { line_reference: string; sku: string }[]; warnings?: string[]; code?: string; retryable?: boolean; errors?: { path?: string; line_reference?: string; sku?: string; [k: string]: unknown }[] }`
  - `signWebhook(secret: string, timestampIso: string, rawBody: string): string`
  - `buildTimestamp(now?: Date): string` — ISO-8601 con offset `-03:00` explícito
  - `sendPurchaseWebhook(payload: PurchasePayload): Promise<PurchaseResult>`

- [ ] **Step 1: Escribir tests de firma y timestamp (fallan)**

```ts
// __tests__/gocelular-webhook.test.ts
import { describe, it, expect } from 'vitest'
import { signWebhook, buildTimestamp } from '@/lib/gocelular-webhook'

describe('signWebhook', () => {
  it('firma HMAC-SHA256 de timestamp + "." + rawBody en hex minuscula', () => {
    // Vector precomputado con: crypto.createHmac('sha256','test-secret')
    //   .update('2026-08-12T14:30:00-03:00.{"a":1}').digest('hex')
    const sig = signWebhook('test-secret', '2026-08-12T14:30:00-03:00', '{"a":1}')
    expect(sig).toBe('577f72d4873cb59626690c46f35923d70bddb17d645b3431d17566835051072d')
  })

  it('cambia si cambia el body', () => {
    const a = signWebhook('test-secret', '2026-08-12T14:30:00-03:00', '{"a":1}')
    const b = signWebhook('test-secret', '2026-08-12T14:30:00-03:00', '{"a":2}')
    expect(a).not.toBe(b)
  })
})

describe('buildTimestamp', () => {
  it('genera ISO-8601 con offset -03:00 explicito', () => {
    // 15:30 UTC == 12:30 en Argentina (UTC-3)
    const ts = buildTimestamp(new Date('2026-08-12T15:30:00.000Z'))
    expect(ts).toBe('2026-08-12T12:30:00-03:00')
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- gocelular-webhook`
Expected: FAIL — module not found `@/lib/gocelular-webhook`

- [ ] **Step 3: Implementar `lib/gocelular-webhook.ts`**

```ts
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
  for (let attempt = 0; attempt < 3; attempt++) {
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

      const retryable = res.status >= 500 || res.status === 503
      last = { ok: false, status: res.status, body, retryable }
      if (!retryable) return last
    } catch {
      last = { ok: false, status: 0, body: null, retryable: true }
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
  }
  return last
}
```

- [ ] **Step 4: Correr tests, verificar que pasan**

Run: `npm test -- gocelular-webhook`
Expected: PASS (3 tests)

- [ ] **Step 5: Verificar tipos y commitear**

```bash
npx tsc --noEmit
git add lib/gocelular-webhook.ts __tests__/gocelular-webhook.test.ts
git commit -m "Cliente puro del webhook de compras GOcelular: firma HMAC, timestamp AR, POST con reintentos"
```

---

### Task 2: Parser del Excel de IMEIs — `lib/imei-excel-parser.ts`

**Files:**
- Create: `lib/imei-excel-parser.ts`
- Test: `__tests__/imei-excel-parser.test.ts`

**Interfaces:**
- Consumes: `xlsx` (SheetJS, ya en package.json).
- Produces (usadas por Task 4):
  - `interface ImeiParseResult { lines: { sku: string; ean: string | null; imeis: string[] }[]; errores: string[] }`
  - `parseImeiExcel(imeiFileB64OrText: string, skusConocidos: Set<string>): ImeiParseResult`
  - `luhnValido(imei: string): boolean` (exportada — Task 3 la reusa)

**Contexto para el implementador:** `pedido.imeiFile` guarda el Excel como **base64 del .xlsx** (ver `ImeiFileSection` en `app/(admin)/compras/gestor/GestorClient.tsx`, función `isBase64`), o **texto plano CSV** en pedidos viejos (legacy). El Excel lo arma cada proveedor con formato libre, pero SIEMPRE contiene columnas con IMEI, EAN y SKU de fabricante (confirmado por Emiliano). Se detectan por contenido, no por encabezado: IMEI = 15 dígitos que pasan Luhn; EAN = 8-14 dígitos que no son IMEI; SKU = columna cuyo contenido matchea `skusConocidos` o, si ninguna matchea, la columna de texto no numérico con más valores repetidos por modelo.

- [ ] **Step 1: Escribir tests del parser (fallan)**

```ts
// __tests__/imei-excel-parser.test.ts
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseImeiExcel, luhnValido } from '@/lib/imei-excel-parser'

// IMEIs Luhn-validos precomputados
const IMEI_A = '354581531507664'
const IMEI_B = '354581531507672'
const IMEI_C = '351755488512868'

function xlsxB64(rows: unknown[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
}

describe('luhnValido', () => {
  it('acepta IMEI valido y rechaza invalido', () => {
    expect(luhnValido(IMEI_A)).toBe(true)
    expect(luhnValido('354581531507665')).toBe(false)
    expect(luhnValido('123')).toBe(false)
  })
})

describe('parseImeiExcel', () => {
  const skus = new Set(['PB970105AR', 'SM-A075MZKEARO'])

  it('detecta columnas por contenido y agrupa IMEIs por SKU', () => {
    const b64 = xlsxB64([
      ['SKU', 'EAN', 'IMEI', 'OTRA COSA'],
      ['PB970105AR', '7790894902032', IMEI_A, 'x'],
      ['PB970105AR', '7790894902032', IMEI_B, 'y'],
      ['SM-A075MZKEARO', '8806099122249', IMEI_C, 'z'],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines).toHaveLength(2)
    const moto = r.lines.find(l => l.sku === 'PB970105AR')!
    expect(moto.imeis).toEqual([IMEI_A, IMEI_B])
    expect(moto.ean).toBe('7790894902032')
  })

  it('funciona con columnas en otro orden y sin encabezados', () => {
    const b64 = xlsxB64([
      [IMEI_A, 'PB970105AR', '7790894902032'],
      [IMEI_B, 'PB970105AR', '7790894902032'],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores).toEqual([])
    expect(r.lines[0].sku).toBe('PB970105AR')
    expect(r.lines[0].imeis).toHaveLength(2)
  })

  it('reporta IMEIs con Luhn invalido', () => {
    const b64 = xlsxB64([
      ['SKU', 'IMEI', 'EAN'],
      ['PB970105AR', '354581531507665', '7790894902032'],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores.some(e => e.includes('354581531507665'))).toBe(true)
  })

  it('reporta error claro si no encuentra columna de IMEIs', () => {
    const b64 = xlsxB64([
      ['SKU', 'EAN'],
      ['PB970105AR', '7790894902032'],
    ])
    const r = parseImeiExcel(b64, skus)
    expect(r.errores.some(e => e.toLowerCase().includes('imei'))).toBe(true)
  })

  it('parsea texto plano legacy (CSV) ademas de xlsx base64', () => {
    const csv = `sku;ean;imei\nPB970105AR;7790894902032;${IMEI_A}`
    const r = parseImeiExcel(csv, skus)
    expect(r.errores).toEqual([])
    expect(r.lines[0].imeis).toEqual([IMEI_A])
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- imei-excel-parser`
Expected: FAIL — module not found

- [ ] **Step 3: Implementar `lib/imei-excel-parser.ts`**

```ts
import * as XLSX from 'xlsx'

export interface ImeiParseResult {
  lines: { sku: string; ean: string | null; imeis: string[] }[]
  errores: string[]
}

export function luhnValido(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

function esBase64Xlsx(data: string): boolean {
  if (data.length < 50) return false
  return /^[A-Za-z0-9+/\n]+=*$/.test(data.slice(0, 200))
}

// Convierte el archivo (xlsx base64 o CSV plano legacy) en una matriz de celdas string
function aMatriz(data: string): string[][] {
  if (esBase64Xlsx(data)) {
    const wb = XLSX.read(data, { type: 'base64' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' })
    return rows.map(r => r.map(c => String(c ?? '').trim()))
  }
  // Legacy: texto plano, separador ; o , o tab
  const sep = data.includes(';') ? ';' : data.includes('\t') ? '\t' : ','
  return data
    .split(/\r?\n/)
    .filter(l => l.trim())
    .map(l => l.split(sep).map(c => c.trim()))
}

export function parseImeiExcel(imeiFileB64OrText: string, skusConocidos: Set<string>): ImeiParseResult {
  let matriz: string[][]
  try {
    matriz = aMatriz(imeiFileB64OrText)
  } catch {
    return { lines: [], errores: ['No pude leer el archivo de IMEIs (formato no reconocido)'] }
  }
  if (matriz.length === 0) return { lines: [], errores: ['El archivo de IMEIs está vacío'] }

  const nCols = Math.max(...matriz.map(r => r.length))

  // Clasificar cada columna por contenido de sus celdas no vacias
  const stats = Array.from({ length: nCols }, (_, col) => {
    let imeis = 0, eans = 0, skuMatch = 0, textos = 0, noVacias = 0
    for (const row of matriz) {
      const v = (row[col] ?? '').replace(/\s/g, '')
      if (!v) continue
      noVacias++
      if (/^\d{15}$/.test(v)) imeis++
      else if (/^\d{8,14}$/.test(v)) eans++
      else textos++
      if (skusConocidos.has(v)) skuMatch++
    }
    return { col, imeis, eans, skuMatch, textos, noVacias }
  })

  const colImei = stats.filter(s => s.imeis > 0).sort((a, b) => b.imeis - a.imeis)[0]
  if (!colImei) {
    return { lines: [], errores: ['No encontré una columna de IMEIs (15 dígitos) en el archivo'] }
  }

  // SKU: primero la columna con mas matches contra el catalogo; si no hay, la de texto con mas valores
  let colSku = stats.filter(s => s.col !== colImei.col && s.skuMatch > 0).sort((a, b) => b.skuMatch - a.skuMatch)[0]
  if (!colSku) colSku = stats.filter(s => s.col !== colImei.col && s.textos > 0).sort((a, b) => b.textos - a.textos)[0]
  if (!colSku) {
    return { lines: [], errores: ['No encontré una columna de SKU en el archivo'] }
  }

  const colEan = stats
    .filter(s => s.col !== colImei.col && s.col !== colSku.col && s.eans > 0)
    .sort((a, b) => b.eans - a.eans)[0]

  const errores: string[] = []
  const porSku = new Map<string, { ean: string | null; imeis: string[] }>()
  const vistos = new Set<string>()

  for (const row of matriz) {
    const rawImei = (row[colImei.col] ?? '').replace(/\s/g, '')
    if (!/^\d{15}$/.test(rawImei)) continue // fila de encabezado o vacia
    const sku = (row[colSku.col] ?? '').trim()
    const ean = colEan ? (row[colEan.col] ?? '').replace(/\s/g, '') || null : null

    if (!luhnValido(rawImei)) {
      errores.push(`IMEI con dígito verificador inválido: ${rawImei}`)
      continue
    }
    if (vistos.has(rawImei)) {
      errores.push(`IMEI duplicado en el archivo: ${rawImei}`)
      continue
    }
    vistos.add(rawImei)
    if (!sku) {
      errores.push(`IMEI ${rawImei} sin SKU en su fila`)
      continue
    }
    if (!porSku.has(sku)) porSku.set(sku, { ean, imeis: [] })
    porSku.get(sku)!.imeis.push(rawImei)
  }

  if (porSku.size === 0 && errores.length === 0) {
    errores.push('No encontré filas válidas con IMEI y SKU en el archivo')
  }

  return {
    lines: [...porSku.entries()].map(([sku, d]) => ({ sku, ean: d.ean, imeis: d.imeis })),
    errores,
  }
}
```

- [ ] **Step 4: Correr tests, verificar que pasan**

Run: `npm test -- imei-excel-parser`
Expected: PASS (6 tests)

- [ ] **Step 5: Verificar tipos y commitear**

```bash
npx tsc --noEmit
git add lib/imei-excel-parser.ts __tests__/imei-excel-parser.test.ts
git commit -m "Parser del Excel de IMEIs: deteccion de columnas por contenido, Luhn, agrupado por SKU"
```

---

### Task 3: Pre-validación pura — `lib/purchase-validation.ts`

**Files:**
- Create: `lib/purchase-validation.ts`
- Test: `__tests__/purchase-validation.test.ts`

**Interfaces:**
- Consumes: `PurchaseLine`, `PurchasePayload` de `lib/gocelular-webhook.ts` (Task 1).
- Produces (usada por Task 4):
  - `interface CatalogoGocelular { proveedoresActivos: string[]; deviceSkusActivos: Set<string>; deviceSkusInactivos: Set<string>; addonSkus: Set<string>; imeisExistentes: Set<string> }`
  - `interface ValidacionResult { errores: string[]; warnings: string[] }`
  - `validarCompra(supplier: string, lines: PurchaseLine[], catalogo: CatalogoGocelular): ValidacionResult`

La función es **pura** (no toca la base): recibe el catálogo ya cargado. Task 4 arma el `CatalogoGocelular` con queries. Así los tests no necesitan DB.

- [ ] **Step 1: Escribir tests (fallan)**

```ts
// __tests__/purchase-validation.test.ts
import { describe, it, expect } from 'vitest'
import { validarCompra, type CatalogoGocelular } from '@/lib/purchase-validation'
import type { PurchaseLine } from '@/lib/gocelular-webhook'

const IMEI_A = '354581531507664'
const IMEI_B = '354581531507672'

const catalogo: CatalogoGocelular = {
  proveedoresActivos: ['MIRGOR SA'],
  deviceSkusActivos: new Set(['PB970105AR']),
  deviceSkusInactivos: new Set(['SKU-VIEJO']),
  addonSkus: new Set(['KS-MOTO-G06']),
  imeisExistentes: new Set(),
}

const lineaDevice: PurchaseLine = {
  line_reference: 'L1', item_type: 'device', sku: 'PB970105AR', imeis: [IMEI_A], unit_cost: '185000.00',
}
const lineaAddon: PurchaseLine = {
  line_reference: 'L2', item_type: 'addon', sku: 'KS-MOTO-G06', quantity: 10, unit_cost: '12500.00',
}

describe('validarCompra', () => {
  it('pasa con proveedor y SKUs validos', () => {
    const r = validarCompra('MIRGOR SA', [lineaDevice, lineaAddon], catalogo)
    expect(r.errores).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('matchea proveedor case-insensitive con trim', () => {
    const r = validarCompra('  mirgor sa ', [lineaDevice], catalogo)
    expect(r.errores).toEqual([])
  })

  it('error si el proveedor no matchea ninguno activo', () => {
    const r = validarCompra('ACME SA', [lineaDevice], catalogo)
    expect(r.errores.some(e => e.includes('ACME SA'))).toBe(true)
  })

  it('error si el proveedor matchea mas de uno (duplicados en su catalogo)', () => {
    const cat = { ...catalogo, proveedoresActivos: ['SYNA SA', 'syna sa'] }
    const r = validarCompra('SYNA SA', [lineaDevice], cat)
    expect(r.errores.some(e => e.toLowerCase().includes('más de un proveedor'))).toBe(true)
  })

  it('SKU device inactivo es error (rechazaria la compra completa)', () => {
    const r = validarCompra('MIRGOR SA', [{ ...lineaDevice, sku: 'SKU-VIEJO' }], catalogo)
    expect(r.errores.some(e => e.includes('SKU-VIEJO'))).toBe(true)
  })

  it('SKU sin match es warning (pending_alias), no error', () => {
    const r = validarCompra('MIRGOR SA', [{ ...lineaDevice, sku: 'SKU-NUEVO' }], catalogo)
    expect(r.errores).toEqual([])
    expect(r.warnings.some(w => w.includes('SKU-NUEVO'))).toBe(true)
  })

  it('IMEI ya existente en inventario GOcelular es error', () => {
    const cat = { ...catalogo, imeisExistentes: new Set([IMEI_A]) }
    const r = validarCompra('MIRGOR SA', [lineaDevice], cat)
    expect(r.errores.some(e => e.includes(IMEI_A))).toBe(true)
  })

  it('IMEI duplicado entre lineas es error', () => {
    const l2: PurchaseLine = { ...lineaDevice, line_reference: 'L3', imeis: [IMEI_A] }
    const r = validarCompra('MIRGOR SA', [lineaDevice, l2], catalogo)
    expect(r.errores.some(e => e.includes('duplicado'))).toBe(true)
  })

  it('addon sin unit_cost es error', () => {
    const sinCosto = { ...lineaAddon, unit_cost: undefined }
    const r = validarCompra('MIRGOR SA', [sinCosto], catalogo)
    expect(r.errores.some(e => e.includes('L2'))).toBe(true)
  })

  it('monto con formato invalido es error', () => {
    const r = validarCompra('MIRGOR SA', [{ ...lineaAddon, unit_cost: '12.500,00' }], catalogo)
    expect(r.errores.some(e => e.includes('12.500,00'))).toBe(true)
  })

  it('mas de 5000 unidades totales es error', () => {
    const grande: PurchaseLine = { ...lineaAddon, quantity: 5001 }
    const r = validarCompra('MIRGOR SA', [grande], catalogo)
    expect(r.errores.some(e => e.includes('5000') || e.includes('5.000'))).toBe(true)
  })

  it('junta TODOS los errores en una pasada, no corta en el primero', () => {
    const cat = { ...catalogo, imeisExistentes: new Set([IMEI_A]) }
    const r = validarCompra('ACME SA', [lineaDevice, { ...lineaAddon, unit_cost: undefined }], cat)
    expect(r.errores.length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- purchase-validation`
Expected: FAIL — module not found

- [ ] **Step 3: Implementar `lib/purchase-validation.ts`**

```ts
import type { PurchaseLine } from '@/lib/gocelular-webhook'

export interface CatalogoGocelular {
  proveedoresActivos: string[]
  deviceSkusActivos: Set<string>
  deviceSkusInactivos: Set<string>
  addonSkus: Set<string>
  imeisExistentes: Set<string>
}

export interface ValidacionResult {
  errores: string[]
  warnings: string[]
}

const MONTO_RE = /^\d+(\.\d{1,2})?$/

export function validarCompra(
  supplier: string,
  lines: PurchaseLine[],
  catalogo: CatalogoGocelular
): ValidacionResult {
  const errores: string[] = []
  const warnings: string[] = []

  // Proveedor: trim + case-insensitive, exactamente un match activo
  const needle = supplier.trim().toLowerCase()
  const matches = catalogo.proveedoresActivos.filter(p => p.trim().toLowerCase() === needle)
  if (matches.length === 0) {
    errores.push(`El proveedor "${supplier}" no matchea ningún proveedor activo en GOcelular — revisá el nombre exacto en su catálogo`)
  } else if (matches.length > 1) {
    errores.push(`El proveedor "${supplier}" matchea más de un proveedor activo en GOcelular (duplicados en su catálogo) — coordinar limpieza con GOcelular`)
  }

  if (lines.length === 0) errores.push('La compra no tiene líneas')
  if (lines.length > 200) errores.push(`La compra tiene ${lines.length} líneas y el máximo es 200`)

  let unidades = 0
  let montoTotal = 0
  const imeisVistos = new Set<string>()

  for (const l of lines) {
    const ref = l.line_reference

    if (l.item_type === 'device') {
      if (!l.imeis || l.imeis.length === 0) {
        errores.push(`Línea ${ref}: los celulares requieren IMEIs`)
      } else {
        unidades += l.imeis.length
        for (const imei of l.imeis) {
          if (imeisVistos.has(imei)) errores.push(`IMEI duplicado en la compra: ${imei}`)
          imeisVistos.add(imei)
          if (catalogo.imeisExistentes.has(imei)) {
            errores.push(`El IMEI ${imei} ya existe en el inventario de GOcelular — rechazaría la compra completa`)
          }
        }
      }
      if (catalogo.deviceSkusInactivos.has(l.sku)) {
        errores.push(`El SKU ${l.sku} existe en GOcelular pero está inactivo — rechazaría la compra completa`)
      } else if (!catalogo.deviceSkusActivos.has(l.sku)) {
        warnings.push(`El SKU ${l.sku} no está en el catálogo de devices de GOcelular — quedará como alias pendiente (lo resuelven ellos, no bloquea)`)
      }
    } else {
      // addon
      if (!l.quantity || l.quantity <= 0) errores.push(`Línea ${ref}: los accesorios requieren cantidad mayor a 0`)
      else unidades += l.quantity
      if (!l.unit_cost) errores.push(`Línea ${ref}: los accesorios requieren costo unitario`)
      if (l.imeis && l.imeis.length > 0) errores.push(`Línea ${ref}: los accesorios no llevan IMEIs`)
      if (!catalogo.addonSkus.has(l.sku)) {
        warnings.push(`El SKU ${l.sku} no está en el catálogo de accesorios de GOcelular — quedará como alias pendiente (lo resuelven ellos, no bloquea)`)
      }
    }

    if (l.unit_cost !== undefined) {
      if (!MONTO_RE.test(l.unit_cost)) {
        errores.push(`Línea ${ref}: el costo "${l.unit_cost}" no tiene el formato requerido (decimal con punto, ej. 185000.00)`)
      } else {
        const costo = parseFloat(l.unit_cost)
        const cant = l.item_type === 'device' ? (l.imeis?.length ?? 0) : (l.quantity ?? 0)
        if (costo > 100_000_000) errores.push(`Línea ${ref}: el costo unitario supera el tope de $100.000.000 por línea`)
        montoTotal += costo * cant
      }
    }
  }

  if (unidades > 5000) errores.push(`La compra tiene ${unidades} unidades y el máximo es 5000`)
  if (montoTotal > 500_000_000) errores.push(`El costo total agregado ($${Math.round(montoTotal).toLocaleString('es-AR')}) supera el tope de $500.000.000`)

  return { errores, warnings }
}
```

- [ ] **Step 4: Correr tests, verificar que pasan**

Run: `npm test -- purchase-validation`
Expected: PASS (12 tests)

- [ ] **Step 5: Verificar tipos y commitear**

```bash
npx tsc --noEmit
git add lib/purchase-validation.ts __tests__/purchase-validation.test.ts
git commit -m "Pre-validacion pura de compras contra catalogo GOcelular: proveedor, SKUs, IMEIs, limites"
```

---

### Task 4: Orquestador — `lib/actions/purchase-webhook.ts` + modelo `Pedido`

**Files:**
- Create: `lib/actions/purchase-webhook.ts`
- Modify: `lib/actions/compras.ts` (interfaz `Pedido` ~línea 195, y `subirImeiPedido` ~línea 269)

**Interfaces:**
- Consumes: `sendPurchaseWebhook`, `buildTimestamp`, tipos de Task 1; `parseImeiExcel` de Task 2; `validarCompra`, `CatalogoGocelular` de Task 3; `getPool` de `@/lib/db-pool`; `createAdminClient` de `@/lib/supabase/admin`; interfaz `Pedido` de `compras.ts`.
- Produces (usadas por Task 5):
  - En `Pedido` (compras.ts): campos nuevos `destino?: 'andreani_wh' | 'local'` y `gocelular?: GocelularEstado` donde `interface GocelularEstado { estado: 'no_enviado' | 'validacion_fallida' | 'error_reintentable' | 'rechazado' | 'informado'; purchaseId?: string; requestId?: string; enviadoAt?: string; batches?: { type: string; lines: number; units: number }[]; pendingAliases?: { lineReference: string; sku: string }[]; errores?: string[]; warnings?: string[]; codigoError?: string }`
  - `informarCompraGocelular(pedidoId: string): Promise<{ ok: boolean; estado: string }>` — server action idempotente, llamable desde botones y desde `subirImeiPedido`.

- [ ] **Step 1: Agregar campos al modelo `Pedido` en `lib/actions/compras.ts`**

En la interfaz `Pedido` (~línea 195), después de `imeiFile?: string` agregar:

```ts
  destino?: 'andreani_wh' | 'local'   // default andreani_wh si falta (pedidos viejos)
  gocelular?: GocelularEstado
```

Y arriba de la interfaz `Pedido` agregar (exportada):

```ts
export interface GocelularEstado {
  estado: 'no_enviado' | 'validacion_fallida' | 'error_reintentable' | 'rechazado' | 'informado'
  purchaseId?: string
  requestId?: string
  enviadoAt?: string
  batches?: { type: string; lines: number; units: number }[]
  pendingAliases?: { lineReference: string; sku: string }[]
  errores?: string[]
  warnings?: string[]
  codigoError?: string
}
```

- [ ] **Step 2: Implementar `lib/actions/purchase-webhook.ts`**

```ts
'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendPurchaseWebhook, buildTimestamp, type PurchaseLine, type PurchasePayload } from '@/lib/gocelular-webhook'
import { parseImeiExcel } from '@/lib/imei-excel-parser'
import { validarCompra, type CatalogoGocelular } from '@/lib/purchase-validation'
import type { Pedido, GocelularEstado } from '@/lib/actions/compras'

async function cargarCatalogo(imeis: string[]): Promise<CatalogoGocelular | null> {
  const pool = getPool()
  if (!pool) return null
  const client = await pool.connect()
  try {
    const [prov, devAct, devInact, addons, existentes] = await Promise.all([
      client.query<{ name: string }>(`SELECT name FROM suppliers WHERE active = true`),
      client.query<{ sku: string }>(`SELECT sku FROM device_model_skus WHERE active = true`),
      client.query<{ sku: string }>(`SELECT sku FROM device_model_skus WHERE active = false`),
      client.query<{ sku: string }>(`SELECT sku FROM store_products WHERE is_addon = true AND sku IS NOT NULL`),
      imeis.length > 0
        ? client.query<{ imei: string }>(`SELECT imei FROM inventory_items WHERE imei = ANY($1)`, [imeis])
        : Promise.resolve({ rows: [] as { imei: string }[] }),
    ])
    return {
      proveedoresActivos: prov.rows.map(r => r.name),
      deviceSkusActivos: new Set(devAct.rows.map(r => r.sku)),
      deviceSkusInactivos: new Set(devInact.rows.map(r => r.sku)),
      addonSkus: new Set(addons.rows.map(r => r.sku)),
      imeisExistentes: new Set(existentes.rows.map(r => r.imei)),
    }
  } finally {
    client.release()
  }
}

// Mapeo best-effort del costo de devices: SKU del Excel -> nombre de modelo GOcelular -> item del pedido
async function costosDevices(pedido: Pedido, skus: string[]): Promise<Map<string, string>> {
  const costos = new Map<string, string>()
  const itemsCel = pedido.items.filter(i => (i as { categoria?: string }).categoria === 'Celulares' || true)
  // Caso inequivoco: un solo modelo de celular en el pedido y un solo SKU en el Excel
  const celulares = pedido.items.filter(i => i.precio > 0)
  if (skus.length === 1 && celulares.length >= 1) {
    const unico = celulares.length === 1 ? celulares[0] : null
    if (unico) {
      costos.set(skus[0], unico.precio.toFixed(2))
      return costos
    }
  }
  // Match por nombre de modelo via device_model_skus -> device_models
  const pool = getPool()
  if (!pool || skus.length === 0) return costos
  const client = await pool.connect()
  try {
    const res = await client.query<{ sku: string; nombre: string }>(
      `SELECT dms.sku, dm.name AS nombre
       FROM device_model_skus dms JOIN device_models dm ON dm.model_code = dms.model_code
       WHERE dms.sku = ANY($1)`,
      [skus]
    )
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    for (const r of res.rows) {
      const item = pedido.items.find(i => norm(i.productoNombre) === norm(r.nombre))
      if (item) costos.set(r.sku, item.precio.toFixed(2))
    }
  } finally {
    client.release()
  }
  return costos
}

async function persistir(pedidoId: string, gocelular: GocelularEstado) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return
  const pedido = JSON.parse(data.value) as Pedido
  pedido.gocelular = gocelular
  await supabase.from('flujo_config').upsert({
    key: `pedido_${pedidoId}`,
    value: JSON.stringify(pedido),
    updated_at: new Date().toISOString(),
  })
  revalidatePath('/compras/gestor')
  revalidatePath('/compras')
}

export async function informarCompraGocelular(pedidoId: string): Promise<{ ok: boolean; estado: string }> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return { ok: false, estado: 'pedido_no_encontrado' }
  const pedido = JSON.parse(data.value) as Pedido

  if (pedido.gocelular?.estado === 'informado') {
    return { ok: true, estado: 'informado' } // ya informado, no re-disparar
  }

  const esCelular = (categoria?: string) => (categoria ?? 'Celulares') === 'Celulares'
  const itemsAddon = pedido.items.filter(i => !esCelular((i as { categoria?: string }).categoria ?? pedido.categoria))
  const tieneCelulares = pedido.items.length > itemsAddon.length

  // 1. Lineas device desde el Excel de IMEIs
  const lines: PurchaseLine[] = []
  let refN = 0
  const nextRef = () => `L${++refN}`

  if (tieneCelulares) {
    if (!pedido.imeiFile) {
      await persistir(pedidoId, { estado: 'validacion_fallida', errores: ['El pedido tiene celulares pero no se cargó el Excel de IMEIs'] })
      return { ok: false, estado: 'validacion_fallida' }
    }
    const pool = getPool()
    let skusConocidos = new Set<string>()
    if (pool) {
      const client = await pool.connect()
      try {
        const res = await client.query<{ sku: string }>(`SELECT sku FROM device_model_skus`)
        skusConocidos = new Set(res.rows.map(r => r.sku))
      } finally {
        client.release()
      }
    }
    const parsed = parseImeiExcel(pedido.imeiFile, skusConocidos)
    if (parsed.errores.length > 0) {
      await persistir(pedidoId, { estado: 'validacion_fallida', errores: parsed.errores })
      return { ok: false, estado: 'validacion_fallida' }
    }
    const costos = await costosDevices(pedido, parsed.lines.map(l => l.sku))
    for (const l of parsed.lines) {
      lines.push({
        line_reference: nextRef(),
        item_type: 'device',
        sku: l.sku,
        imeis: l.imeis,
        ...(l.ean ? { ean: l.ean } : {}),
        ...(costos.has(l.sku) ? { unit_cost: costos.get(l.sku) } : {}),
      })
    }
  }

  // 2. Lineas addon desde los items del pedido
  for (const item of itemsAddon) {
    lines.push({
      line_reference: nextRef(),
      item_type: 'addon',
      sku: item.productoCodigo,
      quantity: item.cantidad,
      unit_cost: item.precio.toFixed(2),
      description: item.productoNombre.slice(0, 256),
    })
  }

  // 3. Pre-validacion contra catalogo GOcelular
  const todosImeis = lines.flatMap(l => l.imeis ?? [])
  const catalogo = await cargarCatalogo(todosImeis)
  if (!catalogo) {
    await persistir(pedidoId, { estado: 'error_reintentable', errores: ['No pude conectar a la base de GOcelular para validar'] })
    return { ok: false, estado: 'error_reintentable' }
  }
  const val = validarCompra(pedido.proveedorNombre, lines, catalogo)
  if (val.errores.length > 0) {
    await persistir(pedidoId, { estado: 'validacion_fallida', errores: val.errores, warnings: val.warnings })
    return { ok: false, estado: 'validacion_fallida' }
  }

  // 4. Enviar
  const payload: PurchasePayload = {
    purchase_reference: pedido.id,
    supplier: pedido.proveedorNombre.trim(),
    destination: pedido.destino ?? 'andreani_wh',
    lines,
    timestamp: buildTimestamp(),
  }
  const res = await sendPurchaseWebhook(payload)

  // 5. Persistir resultado
  if (res.ok && res.body) {
    await persistir(pedidoId, {
      estado: 'informado',
      purchaseId: res.body.purchase_id,
      requestId: res.body.request_id,
      enviadoAt: new Date().toISOString(),
      batches: (res.body.batches ?? []).map(b => ({ type: b.type, lines: b.lines, units: b.units })),
      pendingAliases: (res.body.lineas_pendientes_alias ?? []).map(a => ({ lineReference: a.line_reference, sku: a.sku })),
      warnings: val.warnings,
    })
    return { ok: true, estado: 'informado' }
  }

  if (res.retryable || res.status === 0) {
    await persistir(pedidoId, {
      estado: 'error_reintentable',
      codigoError: res.body?.code,
      errores: [res.body?.code === 'secret_no_configurado'
        ? 'Falta configurar GOCELULAR_WEBHOOK_SECRET'
        : `GOcelular no respondió (HTTP ${res.status}) tras 3 intentos — reintentá en unos minutos`],
      warnings: val.warnings,
    })
    return { ok: false, estado: 'error_reintentable' }
  }

  // 4xx / 409: rechazado
  const detalles = (res.body?.errors ?? []).map(e =>
    [e.path, e.line_reference, e.sku].filter(Boolean).join(' · ')
  ).filter(Boolean)
  const mensajes: Record<string, string> = {
    unauthorized: 'Firma rechazada — revisar GOCELULAR_WEBHOOK_SECRET',
    invalid_payload: 'GOcelular rechazó el formato del payload',
    supplier_desconocido: 'GOcelular no reconoce el proveedor',
    supplier_ambiguo: 'El nombre del proveedor matchea más de uno en GOcelular',
    sku_inactivo: 'Algún SKU existe pero está inactivo en GOcelular',
    imeis_invalid: 'GOcelular rechazó IMEIs (no se guardó nada — corregir y reintentar con el mismo pedido)',
    purchase_conflict: 'Este pedido ya fue informado con otros datos — coordinar corrección manual con GOcelular',
  }
  await persistir(pedidoId, {
    estado: 'rechazado',
    codigoError: res.body?.code,
    errores: [mensajes[res.body?.code ?? ''] ?? `GOcelular rechazó la compra (${res.body?.code ?? 'HTTP ' + res.status})`, ...detalles],
    warnings: val.warnings,
  })
  return { ok: false, estado: 'rechazado' }
}
```

**Nota para el implementador:** `PedidoItem` en `compras.ts` no tiene campo `categoria` por ítem — la categoría está a nivel `pedido.categoria` (opcional) y en el catálogo de productos (`compras_productos.categoria`). Ajustar `esCelular`/`itemsAddon` a lo que realmente exista: si los ítems no traen categoría, cargar las categorías desde `compras_productos` por `productoId` (un solo query Supabase `in('id', ids)`) y clasificar con eso. Dejar el criterio: `categoria === 'Celulares'` → device; cualquier otra → addon.

- [ ] **Step 3: Hook del disparo automático en `subirImeiPedido` (compras.ts ~línea 269)**

Reemplazar el final de `subirImeiPedido`:

```ts
export async function subirImeiPedido(pedidoId: string, imeiData: string) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return { error: 'Pedido no encontrado' }
  const pedido = JSON.parse(data.value) as Pedido
  pedido.imeiFile = imeiData
  const res = await guardarPedido(pedido)
  if ('error' in res && res.error) return res

  // Disparo automatico del webhook de compras (la subida nunca se bloquea por esto)
  if (pedido.gocelular?.estado !== 'informado') {
    const { informarCompraGocelular } = await import('@/lib/actions/purchase-webhook')
    await informarCompraGocelular(pedidoId).catch(() => {})
  }
  return res
}
```

- [ ] **Step 4: Correr tests existentes y tipos**

Run: `npm test && npx tsc --noEmit`
Expected: PASS todos (los tests de Tasks 1-3 siguen verdes; no hay tests nuevos para la action — su lógica testeable vive en los módulos puros)

- [ ] **Step 5: Commitear**

```bash
git add lib/actions/purchase-webhook.ts lib/actions/compras.ts
git commit -m "Orquestador del webhook de compras: pipeline parse->validar->enviar->persistir con disparo automatico al subir IMEIs"
```

---

### Task 5: UI del gestor — destino, chip de estado, botones

**Files:**
- Modify: `app/(admin)/compras/gestor/GestorClient.tsx` (interfaz local `Pedido` ~línea 60, creación de pedido ~líneas 295-320, tarjetas de pedidos enviados/confirmados, `ImeiFileSection` ~línea 1422)

**Interfaces:**
- Consumes: `informarCompraGocelular(pedidoId)` de Task 4; campos `destino` y `gocelular` del `Pedido` (sincronizar la interfaz local del client con la de `compras.ts`).
- Produces: nada consumido por otras tasks (task final de UI).

- [ ] **Step 1: Sincronizar la interfaz `Pedido` local del client**

En `GestorClient.tsx` (~línea 60), agregar a la interfaz local `Pedido` los mismos campos que en `compras.ts`:

```ts
  destino?: 'andreani_wh' | 'local'
  gocelular?: {
    estado: 'no_enviado' | 'validacion_fallida' | 'error_reintentable' | 'rechazado' | 'informado'
    purchaseId?: string
    enviadoAt?: string
    batches?: { type: string; lines: number; units: number }[]
    pendingAliases?: { lineReference: string; sku: string }[]
    errores?: string[]
    warnings?: string[]
    codigoError?: string
  }
```

- [ ] **Step 2: Selector de destino al armar el pedido**

Donde se crea el pedido nuevo (~líneas 295-320, los dos lugares con `estado: 'borrador'`), agregar `destino: destinoSeleccionado` al objeto. Agregar el estado y el selector en el formulario de armado del pedido (junto a los controles existentes, siguiendo el estilo de selects del archivo):

```tsx
const [destinoSeleccionado, setDestinoSeleccionado] = useState<'andreani_wh' | 'local'>('andreani_wh')
```

```tsx
<div className="flex items-center gap-2">
  <label className="text-xs text-gray-500">Destino:</label>
  <select
    value={destinoSeleccionado}
    onChange={e => setDestinoSeleccionado(e.target.value as 'andreani_wh' | 'local')}
    className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-700"
  >
    <option value="andreani_wh">Warehouse Andreani</option>
    <option value="local">Local</option>
  </select>
</div>
```

- [ ] **Step 3: Componente `GocelularChip` + botones de acción**

Agregar al final del archivo (antes de `ImeiFileSection` o después, componente hermano):

```tsx
function GocelularChip({ pedidoId, gocelular, soloAddons }: {
  pedidoId: string
  gocelular?: Pedido['gocelular']
  soloAddons: boolean
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [expandido, setExpandido] = useState(false)

  async function disparar() {
    setEnviando(true)
    const { informarCompraGocelular } = await import('@/lib/actions/purchase-webhook')
    await informarCompraGocelular(pedidoId)
    setEnviando(false)
    router.refresh()
  }

  const estado = gocelular?.estado ?? 'no_enviado'
  const chips: Record<string, { label: string; cls: string }> = {
    no_enviado: { label: 'GOcelular: sin informar', cls: 'bg-gray-100 text-gray-500 border-gray-300' },
    validacion_fallida: { label: 'GOcelular: validación fallida', cls: 'bg-red-50 text-red-700 border-red-200' },
    error_reintentable: { label: 'GOcelular: error de envío', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    rechazado: { label: 'GOcelular: rechazado', cls: 'bg-red-50 text-red-700 border-red-200' },
    informado: { label: 'GOcelular: informado ✓', cls: 'bg-green-50 text-green-700 border-green-200' },
  }
  const c = chips[estado]
  const tieneDetalle = (gocelular?.errores?.length ?? 0) > 0 || (gocelular?.pendingAliases?.length ?? 0) > 0 || estado === 'informado'

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => tieneDetalle && setExpandido(!expandido)}
          className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${c.cls} ${tieneDetalle ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {c.label}{tieneDetalle ? (expandido ? ' ▴' : ' ▾') : ''}
        </button>
        {estado === 'no_enviado' && soloAddons && (
          <button onClick={disparar} disabled={enviando}
            className="text-[11px] px-2 py-0.5 bg-gray-900 text-white rounded-full disabled:opacity-50">
            {enviando ? 'Enviando...' : 'Informar a GOcelular'}
          </button>
        )}
        {estado === 'validacion_fallida' && (
          <button onClick={disparar} disabled={enviando}
            className="text-[11px] px-2 py-0.5 bg-gray-900 text-white rounded-full disabled:opacity-50">
            {enviando ? 'Enviando...' : 'Revalidar y enviar'}
          </button>
        )}
        {estado === 'error_reintentable' && (
          <button onClick={disparar} disabled={enviando}
            className="text-[11px] px-2 py-0.5 bg-gray-900 text-white rounded-full disabled:opacity-50">
            {enviando ? 'Enviando...' : 'Reintentar'}
          </button>
        )}
      </div>
      {expandido && gocelular && (
        <div className="mt-1.5 text-[11px] space-y-0.5">
          {estado === 'informado' && (
            <p className="text-green-700">
              purchase_id: <span className="font-mono">{gocelular.purchaseId}</span>
              {gocelular.enviadoAt && ` · ${new Date(gocelular.enviadoAt).toLocaleString('es-AR')}`}
              {gocelular.batches?.map(b => ` · ${b.units} ${b.type === 'device' ? 'celulares' : 'accesorios'}`).join('')}
            </p>
          )}
          {(gocelular.errores ?? []).map((e, i) => <p key={i} className="text-red-600">• {e}</p>)}
          {(gocelular.pendingAliases ?? []).length > 0 && (
            <p className="text-amber-600">
              SKUs pendientes de alias (GOcelular los resuelve, no requiere acción): {gocelular.pendingAliases!.map(a => a.sku).join(', ')}
            </p>
          )}
          {(gocelular.warnings ?? []).map((w, i) => <p key={i} className="text-amber-600">• {w}</p>)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Insertar el chip en las tarjetas de pedidos**

En la vista de pedidos enviados/confirmados (donde está `ImeiFileSection`, ~línea 1330), agregar debajo:

```tsx
<GocelularChip
  pedidoId={p.id}
  gocelular={p.gocelular}
  soloAddons={!p.items.some(i => esCategoriasCelular(i))}
/>
```

**Nota para el implementador:** definir `esCategoriasCelular` según cómo se resuelva la categoría por ítem en Task 4 (mismo criterio). Si la categoría por ítem no está disponible en el client, computar `soloAddons` desde `pedido.categoria` o pasarla desde el server component. El criterio funcional: el botón "Informar a GOcelular" manual solo aparece para pedidos sin celulares; los pedidos con celulares se disparan solos al subir el Excel.

- [ ] **Step 5: Verificar tipos, probar en dev y commitear**

```bash
npx tsc --noEmit
npm run dev   # verificar manualmente: selector visible al armar pedido, chip en tarjetas
git add "app/(admin)/compras/gestor/GestorClient.tsx"
git commit -m "UI gestor: selector de destino, chip de estado GOcelular y botones de reintento"
```

---

### Task 6: Variables de entorno, deploy y prueba de integración

**Files:**
- Modify: `.env.local` (agregar vars — NO commitear)
- Vercel: agregar env vars al proyecto `consignacion-app`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: sistema en producción.

- [ ] **Step 1: Configurar env vars**

En `.env.local` agregar (el secret lo provee Emiliano cuando Pedro se lo pase — **verificado 2026-08-12 que el secret de consignación NO sirve**):

```
GOCELULAR_WEBHOOK_SECRET=<pendiente de Pedro>
GOCELULAR_WEBHOOK_URL=https://gocelular.gocuotas.com/api/webhooks/gocelular/purchase
```

En Vercel: `npx vercel env add GOCELULAR_WEBHOOK_SECRET production` (y `GOCELULAR_WEBHOOK_URL` si se quiere override; el default del código ya apunta a producción).

- [ ] **Step 2: Validar el secret sin efectos (cuando llegue)**

Probe inocuo — body `{}` firmado; `400 invalid_payload` = secret OK, `401` = secret mal:

```bash
node -e "
const crypto = require('crypto');
const secret = process.argv[1];
const now = new Date(Date.now() - 3*3600000).toISOString().slice(0,19) + '-03:00';
const sig = crypto.createHmac('sha256', secret).update(now + '.{}').digest('hex');
fetch('https://gocelular.gocuotas.com/api/webhooks/gocelular/purchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Gocelular-Signature': sig, 'X-Gocelular-Timestamp': now },
  body: '{}',
}).then(async r => console.log(r.status, await r.text()));
" "EL_SECRET_ACA"
```

Expected: `400` con `code: "invalid_payload"` (auth pasó, payload vacío rechazado, cero writes).

- [ ] **Step 3: Deploy y prueba real coordinada**

```bash
npx tsc --noEmit && npm test
npx vercel --prod --yes
```

Luego, coordinado con Pedro (avisarle antes):
1. Armar un pedido de prueba chico (1 celular con IMEI real de una compra verdadera, o lo que Pedro sugiera).
2. Subir el Excel → verificar chip "Informado ✓" con `purchase_id`.
3. Verificar del lado GOcelular: `SELECT * FROM purchase_intakes ORDER BY created_at DESC LIMIT 1` (tenemos lectura) — debe aparecer la compra con su `status`, y si `destination = 'andreani_wh'`, el ASN encolado.
4. Confirmar con Pedro que el intake les llegó bien.

- [ ] **Step 4: Commit final y push**

```bash
git push
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura de spec:** cliente puro (T1), parser (T2), pre-validación (T3), orquestador + modelo + disparo automático (T4), UI completa con chip/botones/destino (T5), env + prueba integración (T6). Los "pendientes externos" del spec (secret de Pedro, limpieza de suppliers, compra de prueba) están en T6 y en la comunicación a GOcelular — fuera del código.
- **Sin placeholders:** todo el código está escrito; las dos "Notas para el implementador" (categoría por ítem en T4/T5) señalan una verificación contra el código real con el criterio funcional definido, no un TODO abierto.
- **Consistencia de tipos:** `PurchaseLine`/`PurchasePayload`/`PurchaseResult` (T1) se consumen tal cual en T3/T4; `GocelularEstado` (T4) se replica en la interfaz local del client (T5); `informarCompraGocelular(pedidoId: string)` es la única entrada pública.
