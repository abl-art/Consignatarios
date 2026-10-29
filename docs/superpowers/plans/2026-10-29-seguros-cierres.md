# Seguros — Cierres Mensuales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foto mensual congelada de los certificados de seguro (resumen de devengo + Excel del broker) con cron el día 1, pestaña Cierres y descarga del Excel histórico.

**Architecture:** Tabla `seguros_cierres` (una fila por mes, jsonb con resumen y filas del Excel); lógica pura `armarCierre` reutilizando `devengoMensual`/`filasBroker`; action `congelarCierre` idempotente + cron; 5ta pestaña en /seguros y export histórico por query param.

**Tech Stack:** El de la etapa 1 (Next.js 14 + Supabase + vitest + xlsx). Working dir: **/home/cremi/consignacion-seguros** (worktree de la rama `seguros` — el checkout principal lo usa otra sesión).

**Spec:** `docs/superpowers/specs/2026-10-28-seguros-design.md` (sección "Etapa 2a — Cierres mensuales")

## Global Constraints

- Tests: `npx vitest run` en verde en cada commit (hoy 909).
- SQL en prod vía pooler `aws-1-us-west-2.pooler.supabase.com:5432` user `postgres.rnjxmmcsxmyaktseegvt` (host directo IPv6-only).
- Reusar sin duplicar: el resumen del mes sale de `devengoMensual` y las filas de `filasBroker` (lib/seguros-informes.ts) — NADA de reimplementar devengo o mapeo de columnas.
- Cron con el guard del patrón `congelar-proyecciones` (incl. `?force=1`); writes vía `createAdminClient`; errores de lectura que gatean comportamiento SIEMPRE tiran (regla de la etapa 1).
- El switch del seguro en prod sigue INACTIVO; nada de datos sintéticos persistentes en prod.
- Deploy: `npx vercel --prod` desde el worktree.

## Review Focus

1. Congelar dos veces el mismo mes no debe duplicar ni pisar (unique mes + on-conflict no-op; `force` re-congela explícito) → test/verificación en Task 1.
2. El resumen del cierre debe coincidir EXACTO con la fila de ese mes en la pestaña Prima/Resultado al momento de congelar (misma fuente `devengoMensual`) → test en Task 1.
3. Sin certificados emitidos el cron es no-op y no inserta filas vacías → smoke en Task 1.
4. El Excel histórico descargado debe ser byte-consistente con las filas congeladas (no re-fetchea facturas ni certificados vivos) → verificación en Task 2.
5. Mes con certificado anulado DESPUÉS del cierre: el cierre viejo no cambia (es jsonb congelado) y el mes siguiente lo refleja → razonado por diseño; test de armarCierre con fechaAnula posterior al mes.

---

### Task 1: Tabla, lógica pura de cierre, action y cron

**Files:**
- Create: `scripts/seguros-cierres.sql`
- Modify: `lib/seguros-informes.ts` (agregar `armarCierre`), `lib/actions/seguros.ts` (agregar `congelarCierre`, `getCierres`), `vercel.json`
- Create: `app/api/cron/seguros-cierre/route.ts`
- Test: `__tests__/seguros-informes.test.ts` (ampliar)

**Interfaces:**
- Consumes: `devengoMensual`, `filasBroker`, `COLUMNAS_BROKER`, tipos `CertDevengo`/`ParametroPct` (lib/seguros-informes.ts); `CertificadoRow`, patrón de actions (lib/actions/seguros.ts); `fetchFacturasBPorOrden` (lib/gocelular.ts).
- Produces:

```ts
// lib/seguros-informes.ts
export type ResumenCierre = { mes: string; certificados: number; vigentes: number; anulados: number; siniestrados: number; pendientes: number; sumaVigente: number; prima: number; ingreso: number; resultado: number }
export function armarCierre(
  certs: CertificadoRow[], facturas: Map<string, { numero: string; fecha: string }>,
  primas: ParametroPct[], ingresos: ParametroPct[], mes: string,
): { resumen: ResumenCierre; filas: (string | number | null)[][] }
// lib/actions/seguros.ts
export type CierreRow = { mes: string; congeladoAt: string; resumen: ResumenCierre }
export async function congelarCierre(opts?: { mes?: string; force?: boolean }): Promise<{ ok: boolean; motivo?: string }>
export async function getCierres(): Promise<CierreRow[]>
export async function getCierreFilas(mes: string): Promise<(string | number | null)[][] | null>
```

- [ ] **Step 1: Tests de `armarCierre`** en `__tests__/seguros-informes.test.ts`:

```ts
// - resumen.prima/ingreso/resultado/sumaVigente/certificados IGUALES a la fila `mes` de devengoMensual con los mismos inputs (comparar contra el valor literal del caso ya testeado: cert costo 242000/suma 266200, prima 2, ingreso 3, mes '2026-10' → 5324/7260/1936)
// - conteos por estado: 1 vigente + 1 anulado + 1 siniestrado + 1 pendiente → {vigentes:1, anulados:1, siniestrados:1, pendientes:1, certificados:4}
// - filas === filasBroker(certs, facturas) (mismo output, pendiente excluido de filas pero contado en resumen)
// - cert con fechaAnula POSTERIOR al mes pedido → cuenta como vigente en ese mes y devenga (el cierre de octubre no sabe de una anulación de noviembre)
// - mes sin devengo (sin certs emitidos) → resumen en ceros y filas []
```

- [ ] **Step 2: `npx vitest run __tests__/seguros-informes.test.ts` → FAIL.**
- [ ] **Step 3: Implementar `armarCierre`.** Regla de conteo por estado, relativa al mes pedido: `anulado` si fechaAnula ≤ último día del mes; `siniestrado` si fechaSiniestro ≤ último día del mes (si tiene ambas, gana la más temprana); `pendiente` por estado; `vigente` el resto (incluye certs cuya anulación es posterior al mes). Documentar en JSDoc.
- [ ] **Step 4: `npx vitest run` completo en verde.**
- [ ] **Step 5: `scripts/seguros-cierres.sql`** — `CREATE TABLE IF NOT EXISTS seguros_cierres (id uuid pk default gen_random_uuid(), mes text not null unique, congelado_at timestamptz not null default now(), resumen jsonb not null, filas_excel jsonb not null)`. Sin RLS (patrón repo). Ejecutar en prod vía pooler y verificar `select count(*) = 0`.
- [ ] **Step 6: `congelarCierre`** en lib/actions/seguros.ts: default mes = anterior al actual (UTC); lee certificados (`getCertificados` — ya tira en error), si no hay NINGUNO emitido → `{ok:false, motivo:'sin certificados emitidos'}` sin insertar; facturas vía `fetchFacturasBPorOrden`; parámetros de config; `armarCierre`; INSERT con `on conflict (mes) do nothing` → si no insertó y !force → `{ok:false, motivo:'ya congelado'}`; con force: delete+insert. `getCierres` ordenado desc; `getCierreFilas` lee `filas_excel` del mes.
- [ ] **Step 7: Cron route** `app/api/cron/seguros-cierre/route.ts` (guard patrón congelar-proyecciones; `?force=1` y `?mes=YYYY-MM` passthrough; try/catch → {ok:false} 500) + vercel.json `{ "path": "/api/cron/seguros-cierre", "schedule": "0 5 1 * *" }`.
- [ ] **Step 8: Smoke prod** (script descartable en scratchpad): `congelarCierre()` → `{ok:false, motivo:'sin certificados emitidos'}` y tabla sigue en 0.
- [ ] **Step 9: `npx vitest run` + `npx tsc --noEmit` en verde. Commit** — `feat(seguros): cierres mensuales congelados con cron el día 1`

### Task 2: Pestaña Cierres, export histórico, manual y deploy

**Files:**
- Create: `components/seguros/CierresTab.tsx`
- Modify: `app/(admin)/seguros/page.tsx` (5ta pestaña), `app/api/seguros/export/route.ts` (query param `?cierre=`), `docs/manual-seguros/*` (sección cierres)

**Interfaces:**
- Consumes: `getCierres`/`getCierreFilas`/`congelarCierre` (Task 1), `COLUMNAS_BROKER`, patrón de los otros tabs.

- [ ] **Step 1: Export histórico** — `app/api/seguros/export/route.ts`: con `?cierre=YYYY-MM` sirve el xlsx desde `getCierreFilas(mes)` (404 si no existe el cierre; NUNCA re-fetchea datos vivos en ese modo); filename `seguros-robo-cierre-YYYY-MM.xlsx`; sin el param, comportamiento actual intacto.
- [ ] **Step 2: `CierresTab.tsx`** — tabla (mes, congelado el, certificados, vigentes/anulados/siniestrados, suma vigente, prima, ingreso, resultado, botón ⬇ Excel) + botón "Congelar <mes anterior>" con confirmación 2 pasos, visible solo si ese mes no está congelado; estado vacío claro ("Todavía no hay cierres — el primer cierre se congela solo el día 1 del mes que viene, o manualmente acá"). Estilo Finanzas. 5ta pestaña "Cierres" en page.tsx (datos server-side).
- [ ] **Step 3: Verificación dev**: `npm run dev` en el worktree, sembrar un cierre sintético por SQL (mes '2026-09', resumen y filas de juguete), verificar tabla + descarga del xlsx histórico + que el botón congelar desaparece para ese mes; LIMPIAR el seed. `npx vitest run` + `npx tsc --noEmit` en verde.
- [ ] **Step 4: Manual** — agregar sección "📦 Cierres mensuales" a `docs/manual-seguros/index.html` y `manual-inline.html` (qué es un cierre, cuándo se congela solo, el botón manual, y que el Excel histórico es el que se concilia con la factura de la aseguradora); captura real de la pestaña (puede ser con el cierre sintético del Step 3 antes de limpiarlo, o el estado vacío si es más claro). Mantener estilo del manual existente.
- [ ] **Step 5: Commit** (`feat(seguros): pestaña Cierres con export histórico + manual`) **+ deploy** `npx vercel --prod` desde el worktree. Smoke prod: /seguros carga con la pestaña nueva; `/api/seguros/export?cierre=2026-09` → 404 (no hay cierres); cron responde.
