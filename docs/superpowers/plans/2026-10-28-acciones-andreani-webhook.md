# Acciones de Andreani (Cancelar / Rescate / Devolución) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disparar las tres acciones del lado Andreani (cancelar pedido / rescate / devolución) desde GOcelular360 por el webhook de Pedro, con un botón inteligente de dos pasos en Arrepentimientos, y seguirlas en Rescates/Devoluciones con doble fuente (Andreani directo + estado de Pedro) hasta el cierre manual.

**Architecture:** Lógica pura en `lib/` testeada (ruteo de acción, mapeo de estados de Pedro, guards, bandera de discrepancia); server actions que firman HMAC el webhook (reusan `sendCancelacionWebhook`/`getCancelacionEstado`); UI en las tres pestañas de `/compras/envios`. El reembolso GOcuotas (acción) no cambia: solo se reubica su botón y se reescribe su guard.

**Tech Stack:** Next.js 14 (App Router, server actions), TypeScript, Supabase (admin client), Postgres réplica (`getPool`), tests con el runner del repo (`*.test.ts` a mano, patrón existente).

**Spec:** `docs/superpowers/specs/2026-10-28-acciones-andreani-webhook-design.md`

## Global Constraints

- Sin sandbox de Andreani: todo contra producción. Patrón obligatorio **preview → apply** (dos pasos) para toda acción que dispare.
- Firma HMAC compartida (`GOCELULAR_WEBHOOK_SECRET`); POST firma `ts.rawBody`, GET firma `ts + "."`. Endpoint `…/api/webhooks/gocelular/cancelaciones` (ya en `lib/gocelular-webhook.ts`).
- Reglas de reintento (ya en `lib/cancelaciones.ts::esReintentable`): `vivo`/`sin_pedido_wh` → reintentar; 409 solo si `retryable:true`; 5xx reintentable.
- Nada se archiva solo: cierre siempre manual (`✓ Resolver`) en Rescates y Devoluciones.
- El reembolso GOcuotas NO usa `cancelar_orden`; sigue siendo el botón "Anular orden" (API Redirect). Solo cambia dónde vive y cuándo se habilita.
- Reusar lo existente: `lib/cancelaciones.ts`, `lib/actions/cancelaciones.ts`, `lib/gocelular-webhook.ts`, `cargarRescate`, `setRescateResuelto`, `getDevoluciones`, `devoluciones_seguimiento`, `rescates_seguimiento`.

## Review Focus

- **Preview que responde `sin_pedido_wh`** (orden de depósito local, sin pedido en Andreani): el botón NO debe disparar nada y avisar que es manual. → Task 2.
- **Estado de Pedro desconocido/nuevo** (un valor fuera de la lista del contrato): el mapeo no debe romper la fila ni marcarla resuelta; cae a "pendiente/consultar". → Task 1.
- **Andreani no responde (504/timeout) pero Pedro sí**: la fila se sigue mostrando con el estado de Pedro; la discrepancia no se calcula contra `null` como si fuera conflicto. → Task 3.
- **Reembolso habilitado antes de tiempo**: `puedeAnularOrden` no debe habilitar el refund en `rescate_pedido` ni en `devolucion_pedida`/`retiro_solicitado` (equipo todavía afuera). → Task 2.
- **Doble disparo del botón** (segundo clic/reentrada tras apply): no debe re-disparar la acción ya pedida (idempotencia por `*_wh_at`). → Task 6/8/9.

---

## File Structure

- `lib/acciones-arrepentimiento.ts` *(nuevo)* — ruteo puro: de `fulfillment` local y del `estado` de Pedro a la acción que corresponde; labels del botón.
- `lib/estados-andreani.ts` *(nuevo)* — mapeo de los estados nuevos de Pedro (rescate/devolución) a etiqueta/chip local, clasificación terminal (ok/mal/pendiente) y bandera de discrepancia contra el estado Andreani directo.
- `lib/arrepentimientos.ts` *(modificar)* — reescribir `puedeAnularOrden` para habilitar según umbral de rescate/devolución en vez de bloquear todo `expedido`.
- `lib/actions/cancelaciones.ts` *(modificar)* — agregar preview/apply/confirm de rescate y devolución (Fase B, payloads de Pedro).
- `lib/actions/devoluciones.ts` *(modificar)* — `resuelto_at` en el seguimiento, `setDevolucionResuelta`, exponer estado de Pedro por fila.
- `lib/actions/rescates.ts` *(modificar)* — exponer estado de Pedro por fila del rescate.
- `lib/devoluciones.ts` / `lib/rescates.ts` *(modificar)* — `separarResueltos` por `resuelto_at` en devoluciones; helpers de banderas.
- `app/(admin)/compras/envios/BotonAccionAndreani.tsx` *(nuevo)* — botón inteligente de dos pasos (generaliza `BotonCancelarPedido`).
- `app/(admin)/compras/envios/ArrepentimientosTable.tsx` *(modificar)* — usar el botón inteligente.
- `app/(admin)/compras/envios/DevolucionesTable.tsx`, tabla de Rescates *(modificar)* — columna estado de Pedro + bandera discrepancia + "✓ Resolver" (devoluciones) + botón "Anular orden" reubicado.
- `scripts/devoluciones-seguimiento-resuelto.sql` *(nuevo)* — migración `resuelto_at`.

---

## FASE A — construible YA (sin dependencia de Pedro)

### Task 1: Mapeo puro de los estados nuevos de Pedro

**Files:**
- Create: `lib/estados-andreani.ts`
- Test: `lib/__tests__/estados-andreani.test.ts`

**Interfaces:**
- Produces:
  - `type ClaseEstado = 'ok' | 'mal' | 'pendiente'`
  - `etiquetaRescate(estado: string | null): string | null` — chip local para `rescate_*`.
  - `etiquetaDevolucion(estado: string | null): string | null` — chip local para `devolucion_*`/`retiro_*`.
  - `claseRescate(estado: string | null): ClaseEstado` — `rescate_recibido`→ok; `rescate_rechazado`→mal; resto→pendiente.
  - `claseDevolucion(estado: string | null): ClaseEstado` — `devolucion_recibida`→ok; `retiro_fallido`→mal; resto→pendiente.
  - `banderaDiscrepancia(andreani: string | null, pedro: string | null): string | null` — null si alguno es null (sin conflicto) o si son coherentes; si no, el texto de la discrepancia.

- [ ] **Step 1: Write the failing tests**

```ts
// estados conocidos → clase correcta
expect(claseRescate('rescate_recibido')).toBe('ok')
expect(claseRescate('rescate_rechazado')).toBe('mal')
expect(claseRescate('rescate_pedido')).toBe('pendiente')
expect(claseDevolucion('devolucion_recibida')).toBe('ok')
expect(claseDevolucion('retiro_fallido')).toBe('mal')
expect(claseDevolucion('retiro_solicitado')).toBe('pendiente')
// Review Focus: estado desconocido NO rompe ni marca ok/mal
expect(claseRescate('algo_nuevo')).toBe('pendiente')
expect(etiquetaRescate('algo_nuevo')).toBe('algo_nuevo') // se muestra crudo, no null/crash
// Review Focus: discrepancia no se calcula contra null
expect(banderaDiscrepancia(null, 'rescate_pedido')).toBeNull()
expect(banderaDiscrepancia('En devolución', null)).toBeNull()
```

- [ ] **Step 2: Run tests — expect FAIL (módulo inexistente).**
- [ ] **Step 3: Implementar `lib/estados-andreani.ts`.** Diccionario estado→etiqueta con los valores del contrato (ver spec §3); `clase*` default `'pendiente'`; `banderaDiscrepancia` devuelve null ante cualquier `null`.
- [ ] **Step 4: Run tests — expect PASS.**
- [ ] **Step 5: Commit** (`feat(envios): mapeo puro de estados de rescate/devolución de Pedro`).

### Task 2: Ruteo de acción + guards (reescribir `puedeAnularOrden`)

**Files:**
- Create: `lib/acciones-arrepentimiento.ts`
- Modify: `lib/arrepentimientos.ts` (`puedeAnularOrden`, ~líneas 159-180)
- Test: `lib/__tests__/acciones-arrepentimiento.test.ts`, y casos nuevos en el test de arrepentimientos.

**Interfaces:**
- Consumes: `FULFILLMENTS_CANCELABLES` de `lib/cancelaciones.ts`.
- Produces:
  - `type AccionAndreani = 'cancelar_pedido' | 'rescate' | 'solicitar_devolucion'`
  - `resolverAccion(fulfillment: string | null): { accion: AccionAndreani; label: string } | { accion: 'manual'; motivo: string } | { accion: 'ninguna'; motivo: string }` — ruteo por dato local (label inicial del botón).
  - `accionDesdeEstadoPedro(estado: string): AccionAndreani | 'manual'` — `no_cancelable_expedido`→rescate; `no_cancelable_entregado`→solicitar_devolucion; `sin_pedido_wh`→manual; default según prefijo.
  - `puedeAnularOrden` (reescrito) suma a su input `rescateEstado?: string | null` y `devolucionEstado?: string | null`, y habilita cuando: (a) pre-despacho como hoy (no expedido ni cancelación pedida/no realizada), **o** (b) `rescateEstado === 'rescate_confirmado' | 'rescate_recibido'`, **o** (c) `devolucionEstado === 'retiro_realizado' | 'devolucion_recibida'`.

- [ ] **Step 1: Write the failing tests**

```ts
// ruteo local
expect(resolverAccion('en cola').accion).toBe('cancelar_pedido')
expect(resolverAccion('expedido').accion).toBe('rescate')
expect(resolverAccion(null).accion).toBe('manual') // depósito local / sin pedido WH
expect(resolverAccion('cancelado').accion).toBe('ninguna')
// preview manda sobre lo local (Review Focus sin_pedido_wh)
expect(accionDesdeEstadoPedro('no_cancelable_entregado')).toBe('solicitar_devolucion')
expect(accionDesdeEstadoPedro('sin_pedido_wh')).toBe('manual')
// puedeAnularOrden: umbrales (Review Focus refund a destiempo)
const base = { estado: 'pendiente', gocuotasOrderId: '1', gocuotasStatus: 'approved' }
expect(puedeAnularOrden({ ...base, fulfillment: 'expedido', rescateEstado: 'rescate_pedido' }).ok).toBe(false)
expect(puedeAnularOrden({ ...base, fulfillment: 'expedido', rescateEstado: 'rescate_confirmado' }).ok).toBe(true)
expect(puedeAnularOrden({ ...base, fulfillment: 'expedido', devolucionEstado: 'retiro_solicitado' }).ok).toBe(false)
expect(puedeAnularOrden({ ...base, fulfillment: 'expedido', devolucionEstado: 'retiro_realizado' }).ok).toBe(true)
// no regresión: pre-despacho sigue habilitado
expect(puedeAnularOrden({ ...base, fulfillment: 'en cola' }).ok).toBe(true)
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implementar `resolverAccion`/`accionDesdeEstadoPedro`; reescribir `puedeAnularOrden`** con los umbrales. Mantener los mensajes de error existentes para los estados que siguen bloqueados.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat(envios): ruteo de acción y guard de reembolso por umbral de rescate/devolución`).

### Task 3: `resuelto_at` en devoluciones + cierre manual

**Files:**
- Create: `scripts/devoluciones-seguimiento-resuelto.sql` (ALTER TABLE add `resuelto_at timestamptz`)
- Modify: `lib/actions/devoluciones.ts` (`setDevolucionResuelta`, exponer `resueltoAt` en `FilaDevolucion`), `lib/devoluciones.ts` (`separarResueltos`)
- Test: casos en `lib/__tests__/devoluciones.test.ts`

**Interfaces:**
- Produces:
  - `setDevolucionResuelta(tracking: string, resuelto: boolean): Promise<{ ok?: true; error?: string }>` — upsert `resuelto_at` por tracking del retorno (patrón `setRescateResuelto`).
  - `FilaDevolucion.resueltoAt: string | null` (campo nuevo).
  - `separarResueltos(filas: FilaDevolucion[]): { pendientes: FilaDevolucion[]; resueltas: FilaDevolucion[] }` — por `resueltoAt != null`, REEMPLAZA el split por `esDevolucionFinalizada`.

- [ ] **Step 1: Test** — `separarResueltos` manda las filas con `resueltoAt` a `resueltas` y el resto a `pendientes`, sin importar `estadoActual` de Andreani (regla "nada se archiva solo").
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3:** SQL de migración; agregar `resuelto_at` al select de `getRecibidosWh`/query; `setDevolucionResuelta`; `separarResueltos`.
- [ ] **Step 4: Run — PASS.** Correr la migración en Supabase (script).
- [ ] **Step 5: Commit** (`feat(envios): cierre manual de devoluciones con resuelto_at`).

### Task 4: Doble fuente en Devoluciones (estado de Pedro por fila)

**Files:**
- Modify: `lib/actions/devoluciones.ts` (sumar el GET de Pedro por `order_number` a cada fila), `lib/estados-andreani.ts` (consumir)
- Test: lógica de `banderaDiscrepancia` ya cubierta (Task 1); acá test de integración liviano del ensamblado si aplica.

**Interfaces:**
- Consumes: `getCancelacionEstado({ order_number })` de `lib/gocelular-webhook.ts`; `etiquetaDevolucion`, `banderaDiscrepancia` de Task 1.
- Produces: `FilaDevolucion.pedroEstado: string | null`, `FilaDevolucion.banderaPedro: string | null`.

- [ ] **Step 1:** agregar al `Promise.all` por fila el `getCancelacionEstado` (timeout corto, catch→null; igual que Andreani, no bloquea la fila).
- [ ] **Step 2:** calcular `banderaPedro = banderaDiscrepancia(devolucion.estadoActual, pedroEstado)`.
- [ ] **Step 3: Commit** (`feat(envios): estado de Pedro como segunda fuente en Devoluciones`).

> Nota: Rescates es simétrico — misma mecánica con `claseRescate`/`etiquetaRescate` sobre la tabla de rescates (`lib/actions/rescates.ts`). Se hace igual que Task 4 una vez validado el patrón.

### Task 5: UI — botón inteligente de dos pasos (branch cancelar) + reubicar "Anular orden"

**Files:**
- Create: `app/(admin)/compras/envios/BotonAccionAndreani.tsx` (generaliza `BotonCancelarPedido.tsx`)
- Modify: `ArrepentimientosTable.tsx` (reemplaza el bloque de `BotonCancelarPedido`), `DevolucionesTable.tsx` + tabla de Rescates (sumar botón "Anular orden" con el guard de Task 2)

**Interfaces:**
- Consumes: `resolverAccion` (label inicial), las actions `previewCancelarPedido`/`aplicarCancelarPedido` existentes; para rescate/devolución, los stubs de Fase B detrás de la misma forma `{ok?|error?}`.

- [ ] **Step 1:** `BotonAccionAndreani` = patrón de `BotonCancelarPedido` (1er clic preview → muestra el label que corresponde según `resolverAccion`/preview; 2do clic apply; `⏳` sondea `confirmar*`). Branch `cancelar_pedido` usa las actions actuales.
- [ ] **Step 2:** en Arrepentimientos reemplazar el render condicional por `<BotonAccionAndreani>` para todas las filas con acción ≠ `ninguna`; caso `manual` muestra aviso (no dispara).
- [ ] **Step 3:** agregar el botón "Anular orden" en las filas de Rescates y Devoluciones usando `puedeAnularOrden` (con `rescateEstado`/`devolucionEstado`) y la action `anularOrdenArrepentimiento` existente.
- [ ] **Step 4:** verificación manual en dev (no hay test de UI); commit (`feat(envios): botón inteligente de acciones + Anular orden en Rescates/Devoluciones`).

---

## FASE B — BLOQUEADA hasta la respuesta de Pedro

> No arrancar hasta tener los payloads (novedad saliente ya enviada). Define la forma esperada; ajustar a lo que confirme Pedro.

### Task 6: Wiring de rescate por webhook

**Files:** Modify `lib/actions/cancelaciones.ts`, `lib/gocelular-webhook.ts` (ampliar `accion` del payload).

**Interfaces (a confirmar con Pedro):**
- `previewRescate(id)`, `aplicarRescate(id)`, `confirmarRescate(id)` — espejo de los de cancelar, con `accion: 'solicitar_rescate'` (o lo que confirme Pedro) y persistiendo `rescate_wh_at`/`rescate_wh_detalle` en `arrepentimientos`. Idempotencia por `rescate_wh_at` (Review Focus doble disparo).

- [ ] Pendiente payload. Tests espejo de cancelaciones una vez fijado el contrato.

### Task 7: Wiring de `solicitar_devolucion` + origen de la fila

**Files:** Modify `lib/actions/cancelaciones.ts`, y según respuesta de Pedro (spec §5) `lib/actions/devoluciones.ts`.

**Interfaces (a confirmar con Pedro):**
- `previewDevolucion(id)`, `aplicarDevolucion(id)`, `confirmarDevolucion(id)`.
- **Si `solicitar_devolucion` NO crea la fila `shipments type='return'` al toque:** agregar store propio keyed por `order_number` (p.ej. `devoluciones_pedidas`) y unirlo en `getDevoluciones` para mostrar "devolución pedida, sin envío físico". Si SÍ la crea, no hace falta.

- [ ] Pendiente payload + respuesta sobre la fila de shipments.

---

## Orden de ejecución

Fase A: Task 1 → 2 → 3 → 4 → 5 (1 y 2 son la base; 3 independiente; 4 depende de 1; 5 depende de 2 y 4). Fase B (6, 7) al llegar la respuesta de Pedro.
