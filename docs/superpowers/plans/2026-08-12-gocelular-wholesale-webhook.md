# GOcelular Wholesale Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las proformas mayoristas confirmadas se informan automáticamente a GOcelular vía su webhook wholesale (modos `stock_local` con IMEIs y `andreani_wh` con delivery), con pre-validación contra las tablas de GOcelular.

**Architecture:** Se extiende el cliente HMAC existente (`lib/gocelular-webhook.ts`) con `sendWholesaleWebhook(rawBody)` que recibe el body YA serializado (los reintentos deben ser byte-idénticos: en modo legacy el timestamp participa del hash de idempotencia). Módulo puro nuevo `lib/wholesale-validation.ts`. Orquestador `lib/actions/wholesale-webhook.ts` con `informarVentaGocelular(proformaId)`, disparado desde `confirmarProforma` (warehouse) y desde la asignación mayorista completa (stock local). Estado persistido en columna jsonb `proformas.gocelular`. Migración SQL en Supabase.

**Tech Stack:** Next.js 14 server actions, Supabase (tablas `proformas`, `proforma_items`, `clientes_mayoristas`, `asignaciones`, `asignacion_items`, `dispositivos`), `pg` vía `getPool()` para la base GOcelular, vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-gocelular-wholesale-webhook-design.md` — leerla entera antes de empezar. La doc del contrato es `gocelular-wholesale-webhook.md` (de Pedro; las reglas citadas en este plan salen de ahí).

## Global Constraints

- Firma idéntica al webhook de compras: HMAC-SHA256 hex de `timestamp + "." + rawBody`, headers `X-Gocelular-Signature`/`X-Gocelular-Timestamp` (ISO-8601 offset `-03:00`, ±5 min), mismo secret `GOCELULAR_WEBHOOK_SECRET`. URL: `GOCELULAR_WHOLESALE_URL` con default `https://gocelular.gocuotas.com/api/webhooks/gocelular/wholesale`.
- **Reintentos: body byte-idéntico SIEMPRE, headers de auth recalculados.** Automáticos solo ante timeout/5xx/503 (backoff 2s/4s/8s, 4 intentos, timeout 10s por intento). Manuales: reusar `payloadEnviado` persistido.
- Montos: string decimal `^\d+(\.\d{1,2})?$`; `total_amount` = Σ `gross_subtotal` comparado en **centavos enteros**; tope $500M; modo andreani_wh además $100M por línea.
- stock_local: `imeis` 1–500, Luhn válidos, sin duplicados, Σ `lines[].quantity` = `imeis.length`, sin `fulfillment` o `"stock_local"`.
- andreani_wh: `fulfillment: "andreani_wh"`, `imeis` PROHIBIDO (top-level y por línea), `delivery` obligatorio (recipient_name ≤100, dni 7-8 dígitos, phone ≤20 dígitos con + opcional, email válido ≤128, street ≤128, number ≤16, floor_apartment ≤32 opcional, locality ≤64, postal_code 4-8 alfanumérico, province ≤64), líneas con `line_reference` único, `item_type`, `sku` de fabricante, ≤500 unidades.
- `proforma_number` canónico `^[1-9][0-9]*$`. `buyer.cuit` 11 dígitos + dígito verificador AFIP.
- Respuestas: 200 accepted/reserved/idempotent_replay → éxito; 4xx códigos legacy (`{error, details}`) Y envelope nuevo (`{result, code, errors[]}`) — parsear ambos. `retryable` solo en 5xx/503.
- La confirmación de proforma y la asignación NUNCA se bloquean por el webhook (trigger no bloqueante con `console.error`).
- Mensajes de UI y errores en español (es-AR, voseo). `npx tsc --noEmit` y `npm test` verdes antes de cada commit (ignorar la falla preexistente de locale en `__tests__/utils.test.ts`).

---

### Task 1: Migración SQL + tipos TS

**Files:**
- Create: `docs/sql/2026-08-12-wholesale-webhook.sql`
- Modify: `lib/types.ts` (interfaz `ClienteMayorista`, ~línea 154)
- Modify: `lib/actions/proformas.ts` (interfaz `Proforma`, ~línea 22)

**Interfaces:**
- Consumes: nada.
- Produces: columnas nuevas en Supabase; `ClienteMayorista` con `plazo_dias: number` y campos `entrega_*: string | null`; `Proforma` con `origen: 'stock_local' | 'andreani_wh'` y `gocelular: GocelularVentaEstado | null`; export `interface GocelularVentaEstado { estado: 'no_enviado' | 'validacion_fallida' | 'error_reintentable' | 'rechazado' | 'informado'; saleId?: string; faStatus?: string; dispatchId?: string; numeroOrdenExterna?: string; enviadoAt?: string; warnings?: string[]; errores?: string[]; codigoError?: string; payloadEnviado?: string }` (en `proformas.ts`).

- [ ] **Step 1: Escribir el SQL**

```sql
-- 2026-08-12 · Webhook venta mayorista GOcelular: campos de entrega + plazo en clientes, origen + estado en proformas
ALTER TABLE clientes_mayoristas
  ADD COLUMN IF NOT EXISTS plazo_dias integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS entrega_nombre text,
  ADD COLUMN IF NOT EXISTS entrega_dni text,
  ADD COLUMN IF NOT EXISTS entrega_telefono text,
  ADD COLUMN IF NOT EXISTS entrega_email text,
  ADD COLUMN IF NOT EXISTS entrega_calle text,
  ADD COLUMN IF NOT EXISTS entrega_numero text,
  ADD COLUMN IF NOT EXISTS entrega_piso_depto text,
  ADD COLUMN IF NOT EXISTS entrega_localidad text,
  ADD COLUMN IF NOT EXISTS entrega_cp text,
  ADD COLUMN IF NOT EXISTS entrega_provincia text;

ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'stock_local',
  ADD COLUMN IF NOT EXISTS gocelular jsonb;

ALTER TABLE proformas DROP CONSTRAINT IF EXISTS proformas_origen_check;
ALTER TABLE proformas ADD CONSTRAINT proformas_origen_check CHECK (origen IN ('stock_local', 'andreani_wh'));
```

- [ ] **Step 2: Aplicar la migración** contra la base Supabase (usar el pool de Postgres de Supabase con la connection string derivada de `NEXT_PUBLIC_SUPABASE_URL` + password en la config del proyecto, o pedirle al controller que la aplique; si se corre en el SQL Editor, guardarla como query nombrada "2026-08-12 wholesale webhook"). Verificar con `SELECT column_name FROM information_schema.columns WHERE table_name='proformas' AND column_name IN ('origen','gocelular')`.

- [ ] **Step 3: Actualizar tipos TS** — agregar a `ClienteMayorista` (lib/types.ts):

```ts
  plazo_dias: number
  entrega_nombre: string | null
  entrega_dni: string | null
  entrega_telefono: string | null
  entrega_email: string | null
  entrega_calle: string | null
  entrega_numero: string | null
  entrega_piso_depto: string | null
  entrega_localidad: string | null
  entrega_cp: string | null
  entrega_provincia: string | null
```

Y en `lib/actions/proformas.ts`, exportar `GocelularVentaEstado` (shape de arriba) y agregar a `Proforma`:

```ts
  origen: 'stock_local' | 'andreani_wh'
  gocelular: GocelularVentaEstado | null
```

- [ ] **Step 4: Verificar y commitear**

```bash
npx tsc --noEmit
git add docs/sql/2026-08-12-wholesale-webhook.sql lib/types.ts lib/actions/proformas.ts
git commit -m "Migracion y tipos para webhook mayorista: entrega/plazo en clientes, origen/gocelular en proformas"
```

---

### Task 2: Cliente wholesale en `lib/gocelular-webhook.ts`

**Files:**
- Modify: `lib/gocelular-webhook.ts`
- Test: `__tests__/gocelular-webhook.test.ts` (agregar describe)

**Interfaces:**
- Consumes: `signWebhook`, `buildTimestamp` existentes.
- Produces (usadas por Task 4):
  - `type WholesaleResponseBody = { sale_id?: string; proforma_number?: string; result?: string; fa_status?: string; imeis_processed?: number; request_id?: string; dispatch?: { id: string; numero_orden_externa: string }; warnings?: string[]; error?: string; details?: unknown; code?: string; retryable?: boolean; errors?: unknown[] }`
  - `interface WholesaleResult { ok: boolean; status: number; body: WholesaleResponseBody | null; retryable: boolean }`
  - `sendWholesaleWebhook(rawBody: string): Promise<WholesaleResult>` — recibe el body YA serializado (byte-idéntico entre reintentos automáticos Y manuales); mismo patrón de retries que `sendPurchaseWebhook` (4 intentos, 2s/4s/8s, timeout 10s, headers frescos por intento); chequeo 1MB; secret faltante → `{ ok:false, status:0, body:{ code:'secret_no_configurado' }, retryable:false }`; env `GOCELULAR_WHOLESALE_URL` default `https://gocelular.gocuotas.com/api/webhooks/gocelular/wholesale`.

- [ ] **Step 1: Tests (fallan)** — nuevo describe en `__tests__/gocelular-webhook.test.ts`, reusando los patrones de mock existentes (`vi.stubGlobal('fetch')`, `vi.stubEnv`, fake timers):

```ts
describe('sendWholesaleWebhook', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('GOCELULAR_WEBHOOK_SECRET', 'test-secret') })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

  it('200 legacy: ok, un solo fetch, body identico al rawBody', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sale_id: 's1', fa_status: 'pending' }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    const raw = JSON.stringify({ proforma_number: '150' })
    const p = sendWholesaleWebhook(raw)
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.ok).toBe(true)
    expect(r.body?.sale_id).toBe('s1')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][1].body).toBe(raw)
  })

  it('400 con envelope legacy {error, details}: no reintenta', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'store_mismatch', details: 'x' }), { status: 400 }))
    vi.stubGlobal('fetch', mockFetch)
    const p = sendWholesaleWebhook('{}')
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.retryable).toBe(false)
    expect(r.body?.error).toBe('store_mismatch')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('503 en todos los intentos: 4 fetch, retryable', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'rejected', code: 'integration_disabled' }), { status: 503 }))
    vi.stubGlobal('fetch', mockFetch)
    const p = sendWholesaleWebhook('{}')
    await vi.runAllTimersAsync()
    const r = await p
    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(r.retryable).toBe(true)
  })

  it('reintentos con el MISMO body y firma distinta por timestamp fresco', async () => {
    let call = 0
    const mockFetch = vi.fn().mockImplementation(() => {
      call++
      return Promise.resolve(new Response('{}', { status: call < 2 ? 500 : 200 }))
    })
    vi.stubGlobal('fetch', mockFetch)
    const raw = '{"a":1}'
    const p = sendWholesaleWebhook(raw)
    await vi.runAllTimersAsync()
    await p
    expect(mockFetch.mock.calls[0][1].body).toBe(raw)
    expect(mockFetch.mock.calls[1][1].body).toBe(raw)
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm test -- gocelular-webhook` → FAIL (sendWholesaleWebhook no existe)

- [ ] **Step 3: Implementar** — en `lib/gocelular-webhook.ts`, refactorizar el núcleo de retries a un helper interno compartido y exponer:

```ts
export type WholesaleResponseBody = {
  sale_id?: string; proforma_number?: string; result?: string; fa_status?: string
  imeis_processed?: number; request_id?: string
  dispatch?: { id: string; numero_orden_externa: string }
  warnings?: string[]
  error?: string; details?: unknown
  code?: string; retryable?: boolean; errors?: unknown[]
}

export interface WholesaleResult { ok: boolean; status: number; body: WholesaleResponseBody | null; retryable: boolean }

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
        signal: AbortSignal.timeout(10000),
      })
      const body = (await res.json().catch(() => null)) as WholesaleResponseBody | null
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
```

(Si el refactor a helper compartido con `sendPurchaseWebhook` sale natural, hacerlo — DRY; si complica los tipos, duplicar el loop es aceptable y se anota como concern.)

- [ ] **Step 4: Verificar y commitear**

```bash
npm test -- gocelular-webhook && npx tsc --noEmit
git add lib/gocelular-webhook.ts __tests__/gocelular-webhook.test.ts
git commit -m "Cliente wholesale: sendWholesaleWebhook con body raw byte-identico y doble envelope de respuesta"
```

---

### Task 3: Pre-validación pura — `lib/wholesale-validation.ts`

**Files:**
- Create: `lib/wholesale-validation.ts`
- Test: `__tests__/wholesale-validation.test.ts`

**Interfaces:**
- Consumes: `luhnValido` de `@/lib/imei-excel-parser`.
- Produces (usadas por Task 4):
  - `cuitValido(cuit: string): boolean` — 11 dígitos + verificador AFIP (pesos [5,4,3,2,7,6,5,4,3,2], mod 11; resto 0→0, 1→inválido salvo dígito 9/4 según regla estándar: usar `dv = 11 - (suma % 11); if (dv === 11) dv = 0; valido = dv !== 10 && dv === ultimoDigito`)
  - `interface VentaLinea { description: string; quantity: number; gross_subtotal: string }`
  - `interface CatalogoVenta { store: { existe: boolean; activo: boolean; nombre: string | null }; imeisEstado: Map<string, { status: string; storeId: string | null }>; provincias: string[] }`
  - `interface DeliveryInput { recipient_name: string; recipient_dni: string; recipient_phone: string; recipient_email: string; street: string; number: string; floor_apartment?: string; locality: string; postal_code: string; province: string }`
  - `validarVenta(input: { proformaNumber: string; storeId: string; consignatario: string; cuit: string; lineas: VentaLinea[]; totalAmount: string; imeis: string[] | null; delivery: DeliveryInput | null; modo: 'stock_local' | 'andreani_wh' }, catalogo: CatalogoVenta): { errores: string[]; warnings: string[] }`
  - `export const PROVINCIAS_AR: string[]` — las 24 jurisdicciones (usada como fallback del catálogo)

**Reglas que implementa (todas juntando errores en una pasada):** proforma_number canónico `^[1-9][0-9]*$`; CUIT válido; store existe+activo y `consignatario` coincide con el nombre del store (normalizado: minúsculas, sin tildes, trim) — si no coincide, ERROR (anti-XOXO); montos formato + Σ en centavos = total + tope $500M; stock_local: imeis 1-500, Luhn, sin duplicados, Σ quantity = imeis.length, cada IMEI en catálogo con status `available` O (`consigned` Y storeId del IMEI === storeId de la venta) — cualquier otro estado o inexistente = ERROR con el IMEI y su estado; andreani_wh: imeis debe ser null (si viene, error), delivery completo con los formatos/límites de Global Constraints, provincia ∈ catálogo (case-insensitive sin tildes), ≤500 unidades, $100M por línea; warning si `recipient_name` > 45 chars (GOcelular trunca y avisa).

- [ ] **Step 1: Tests (fallan)** — cubrir: CUIT válido real (ej. `20385096551` del ejemplo de la doc — verificar con el algoritmo al escribir el test; si no valida, usar un CUIT generado válido) e inválido; store inexistente/inactivo/nombre no coincidente; IMEI `available` OK, `consigned` mismo store OK, `consigned` otro store ERROR, `assigned` ERROR, inexistente ERROR; suma de centavos que NO cuadra (ej. líneas "100.10" + "100.20" vs total "200.31" — debe dar error) y que SÍ cuadra ("200.30"); quantity ≠ imeis; delivery incompleto; provincia inválida; dni de 6 dígitos; > 500 unidades; recipient_name de 50 chars → warning. Mínimo 14 tests.
- [ ] **Step 2: Ver fallar** — `npm test -- wholesale-validation`
- [ ] **Step 3: Implementar** — módulo puro, sin I/O. Comparación de montos SIEMPRE en centavos enteros: `const aCentavos = (s: string) => Math.round(parseFloat(s) * 100)`.
- [ ] **Step 4: Verificar y commitear**

```bash
npm test -- wholesale-validation && npx tsc --noEmit
git add lib/wholesale-validation.ts __tests__/wholesale-validation.test.ts
git commit -m "Pre-validacion pura de ventas mayoristas: CUIT AFIP, store, IMEIs elegibles, montos en centavos, delivery"
```

---

### Task 4: Orquestador — `lib/actions/wholesale-webhook.ts` + triggers

**Files:**
- Create: `lib/actions/wholesale-webhook.ts`
- Modify: `lib/actions/proformas.ts` (`confirmarProforma`, ~línea 171)
- Modify: `lib/actions/asignar.ts` (`prepararAsignacionMayorista`, ~línea 320-420 — después de `confirmarAsignacion`)

**Interfaces:**
- Consumes: `sendWholesaleWebhook`, `buildTimestamp` (Task 2); `validarVenta`, `cuitValido`, `PROVINCIAS_AR`, tipos (Task 3); `GocelularVentaEstado`, `Proforma` (Task 1); `getPool`, `createAdminClient`.
- Produces: `informarVentaGocelular(proformaId: string, opts?: { replay?: boolean }): Promise<{ ok: boolean; estado: string }>` (server action; `replay: true` = reenviar `payloadEnviado` para refrescar `fa_status` de una proforma ya informada).

**Lógica (seguir el patrón de `lib/actions/purchase-webhook.ts` — leerlo entero antes: guarda `enviosEnCurso`, persistencia con retry y try/catch de JSON, comentarios de idempotencia):**

1. Cargar proforma (`proformas` + `proforma_items`) y cliente (`clientes_mayoristas`). Si `estado !== 'confirmada'` → `{ok:false, estado:'no_confirmada'}`. Si `gocelular?.estado === 'informado'` y NO es replay → return informado.
2. stock_local: cargar IMEIs de las asignaciones de la proforma:

```sql
-- Supabase (createAdminClient): asignaciones.proforma_id = proformaId, join asignacion_items → dispositivos
```

```ts
const { data: asigs } = await supabase
  .from('asignaciones')
  .select('id, asignacion_items(dispositivo_id, dispositivos(imei))')
  .eq('proforma_id', proformaId)
const imeis = (asigs ?? []).flatMap(a =>
  (a.asignacion_items ?? []).map(i => (i.dispositivos as { imei: string } | null)?.imei).filter(Boolean) as string[]
)
```

(Verificar el shape real del join de Supabase — si `estado` de la asignación importa (solo confirmadas), filtrar como lo haga el módulo de asignaciones. Si el total de IMEIs ≠ unidades de la proforma → `validacion_fallida` "la asignación de IMEIs está incompleta (X de Y)").

3. Catálogo GOcelular (un connect):

```sql
SELECT gocuotas_store_id, store_name, merchant_name, is_active FROM gocuotas_stores WHERE gocuotas_store_id = $1
```

```sql
SELECT ii.imei, ii.status::text, ii.consigned_store_id::text AS store_ref FROM inventory_items ii WHERE ii.imei = ANY($1)
```

(⚠️ El nombre real de la columna que vincula el IMEI consignado con el store hay que verificarlo en `information_schema.columns` de `inventory_items` — puede ser `store_id`, `consigned_to_store_id`, etc. El implementador la resuelve consultando la base con el patrón de queries del repo y lo documenta en el reporte. El match con `gocuotas_store_id` puede requerir join con `gocuotas_stores.id`.)

Para andreani_wh además: resolver SKU de fabricante por producto (match del `producto_nombre` contra `device_models.name` vía `device_model_skus`, o `store_products.display_name` para addons — mismo criterio de nombre normalizado que `costosDevices` en purchase-webhook.ts) y stock WH por SKU device: `SELECT COUNT(*) FROM inventory_items WHERE status='available' AND physical_location='andreani_wh' AND model_code = $1`. SKU no resoluble → error "Mapeá el producto X a un SKU de GOcelular". Stock insuficiente → error con pedido/disponible. Addons: sin chequeo de stock local (el gate de GOcelular lo cubre; anotar warning "stock de accesorio no verificable").
4. `validarVenta(...)`. Errores → persistir `validacion_fallida` (jsonb UPDATE), return.
5. Armar payload segun modo (campos de la spec §Payload; `gross_subtotal` = `subtotal_con_iva.toFixed(2)`, `total_amount` = `total_con_iva.toFixed(2)`; en andreani_wh: `line_reference` L1..Ln, `item_type` según categoría del producto — `compras_productos.categoria === 'Celulares'` → device, resto addon — y `delivery` desde `entrega_*`). **Primer envío**: `const rawBody = JSON.stringify(payload)`; persistir `payloadEnviado: rawBody` en `gocelular` ANTES del POST. **Replay/reintento manual**: usar `gocelular.payloadEnviado` tal cual, NUNCA regenerar.
6. `sendWholesaleWebhook(rawBody)` y persistir:
   - 200 → `informado` con `saleId: body.sale_id`, `faStatus: body.fa_status`, `dispatchId: body.dispatch?.id`, `numeroOrdenExterna: body.dispatch?.numero_orden_externa`, `warnings: body.warnings`, `enviadoAt`, y conservar `payloadEnviado`.
   - retryable/status 0 (salvo `payload_too_large_local`) → `error_reintentable`.
   - 4xx → `rechazado` con `codigoError` = `body.code ?? body.error` y mensajes es-AR:

```ts
const MENSAJES: Record<string, string> = {
  unauthorized: 'Firma rechazada — revisar GOCELULAR_WEBHOOK_SECRET',
  invalid_payload: 'GOcelular rechazó el formato del payload',
  invalid_imei: 'Algún IMEI tiene formato inválido',
  duplicate_imeis: 'Hay IMEIs duplicados en el lote',
  store_mismatch: 'El store_id y el nombre del local no coinciden en GOcelular — verificá el gocuotas_store_id del cliente',
  imeis_invalid: 'GOcelular rechazó IMEIs del lote (no se registró nada — corregir inventario y reintentar)',
  proforma_conflict: 'Esta proforma ya fue informada con otros datos — coordinar corrección manual con GOcelular',
  sku_desconocido: 'Algún SKU no existe en el catálogo de GOcelular',
  sku_inactivo: 'Algún SKU está inactivo en GOcelular',
  stock_insuficiente: 'Stock insuficiente en el warehouse para algún SKU',
  addon_fulfillment_unavailable: 'El soporte de accesorios en warehouse está apagado — NO reintentar, avisar a GOcelular',
  payload_too_large_local: 'El payload supera 1 MB',
}
```

   Detalles: si `body.errors` (envelope nuevo) es array, mapear cada entry a string legible; si `body.details` (legacy) es string, anexarlo.
7. Persistencia: `UPDATE proformas SET gocelular = $1 WHERE id = $2` vía Supabase `.update({ gocelular })` con retry una vez + `console.error`; `revalidatePath('/mayoristas/proformas')` y `/mayoristas/asignaciones`.

**Triggers:**
- `confirmarProforma` (proformas.ts): después del update exitoso a confirmada, leer `origen` de la proforma; si `'andreani_wh'`:

```ts
if (proforma?.origen === 'andreani_wh') {
  const { informarVentaGocelular } = await import('@/lib/actions/wholesale-webhook')
  await informarVentaGocelular(id).catch((e) => console.error('Error informando venta a GOcelular:', e))
}
```

- `prepararAsignacionMayorista` (asignar.ts): después de `confirmarAsignacion(...)`, si la proforma asignada es `origen === 'stock_local'` y la suma de unidades asignadas (todas las asignaciones de esa proforma) iguala la suma de `cantidad` de sus items → mismo import dinámico + llamado no bloqueante.

- [ ] **Step 1: Implementar el orquestador** (todo lo de arriba; sin tests nuevos — la lógica testeable está en Tasks 2-3, patrón igual a compras).
- [ ] **Step 2: Agregar los dos triggers.**
- [ ] **Step 3: Verificar y commitear**

```bash
npx tsc --noEmit && npm test
git add lib/actions/wholesale-webhook.ts lib/actions/proformas.ts lib/actions/asignar.ts
git commit -m "Orquestador de venta mayorista: pipeline validar->enviar->persistir con payload byte-identico y triggers en confirmar/asignar"
```

---

### Task 5: UI — proformas y clientes

**Files:**
- Modify: `app/(admin)/mayoristas/proformas/ProformasClient.tsx`
- Modify: `app/(admin)/mayoristas/clientes/listado/page.tsx` y su client component (localizar el form de cliente — puede estar en un componente hijo)

**Interfaces:**
- Consumes: `informarVentaGocelular` (Task 4), `Proforma.origen`/`gocelular` (Task 1), `actualizarClienteMayorista` existente (acepta `Partial<ClienteMayorista>` — ya cubre los campos nuevos tras Task 1).
- Produces: nada (task final).

**Requisitos funcionales (adaptar a la estructura real de los archivos, que el implementador debe leer primero):**

1. **Selector "Origen"** al crear proforma en `ProformasClient.tsx`: "Stock local" (default) / "Warehouse Andreani" — el valor viaja en el insert de la proforma (agregar `origen` al `crearProforma` de proformas.ts si el action no lo acepta aún).
2. **Chip GOcelular** en cada tarjeta/fila de proforma confirmada — copiar el patrón visual exacto de `GocelularChip` en `app/(admin)/compras/gestor/GestorClient.tsx` (estados/colores/expandible) adaptando los campos: `sale_id`, `fa_status` (con etiquetas: pending "FA pendiente", processing "FA en proceso", pending_authorization "FA esperando autorización", emitted "FA emitida ✓", failed "FA falló"), `dispatch.numero_orden_externa` si existe, warnings, errores. Botones: "Reintentar" (`validacion_fallida` / `error_reintentable` / `rechazado` con `codigoError !== 'proforma_conflict'` y `!== 'addon_fulfillment_unavailable'`) → `informarVentaGocelular(id)`; "Actualizar estado FA" (solo `informado`) → `informarVentaGocelular(id, { replay: true })`. try/finally con `setEnviando(false)` + `router.refresh()` (mismo fix que el chip de compras).
3. **Ficha de cliente**: sección "Entrega (warehouse) y condición de venta" con los 10 campos `entrega_*` + `plazo_dias`, guardando con `actualizarClienteMayorista`. Indicador visible "⚠ Datos de entrega incompletos para warehouse" cuando falte alguno de los obligatorios (todos salvo `entrega_piso_depto`).
4. En la proforma con `origen = 'andreani_wh'` cuyo cliente tenga datos de entrega incompletos, mostrar la advertencia ANTES de confirmar (texto junto al botón Confirmar).

- [ ] **Step 1: Leer ambos archivos client completos** y decidir inserción siguiendo sus patrones.
- [ ] **Step 2: Implementar los 4 requisitos.**
- [ ] **Step 3: Verificar y commitear**

```bash
npx tsc --noEmit && npm test
git add "app/(admin)/mayoristas/proformas/ProformasClient.tsx" "app/(admin)/mayoristas/clientes/" lib/actions/proformas.ts
git commit -m "UI mayoristas: selector de origen, chip GOcelular con estado FA, datos de entrega en cliente"
```

---

### Task 6: Deploy y prueba de integración con Pedro

- [ ] **Step 1:** Confirmar que la migración SQL (Task 1) está aplicada en producción de Supabase.
- [ ] **Step 2:** `npx tsc --noEmit && npm test` en master merged; deploy `npx vercel --prod --yes`.
- [ ] **Step 3:** Verificar `gocuotas_store_id` de cada cliente mayorista activo contra `gocuotas_stores` (query de lectura) ANTES de la primera proforma real — pendiente conocido de la doc (incidente XOXO). Reportar al usuario cualquier cliente con store_id vacío o no matcheante.
- [ ] **Step 4:** Prueba real coordinada con Pedro: 1 proforma stock_local chica (verificar en su base `wholesale_sales` + IMEIs → `sold_wholesale`) y 1 andreani_wh (verificar `andreani_wholesale_dispatches` + reserva). Confirmar con Pedro el supuesto **gross_subtotal con IVA** ANTES de enviar la primera.
- [ ] **Step 5:** Commit final y push.

## Self-review (hecho al escribir el plan)

- **Cobertura de spec:** migración+tipos (T1), cliente raw-body (T2), validación pura (T3), orquestador+payloadEnviado+triggers+replay (T4), UI completa (T5), verificación store_ids + prueba (T6). El supuesto gross-con-IVA y la columna real de consigned-store están marcados como verificaciones del implementador/prueba, no como TODOs abiertos.
- **Sin placeholders:** el código clave está escrito; las dos verificaciones contra la base real (columna de consigned store, shape del join Supabase) tienen instrucción concreta de cómo resolverse.
- **Consistencia de tipos:** `GocelularVentaEstado` (T1) lo consumen T4/T5; `sendWholesaleWebhook(rawBody: string)` (T2) es la única entrada de red de T4; `validarVenta`/`CatalogoVenta` (T3) se usan tal cual en T4.
