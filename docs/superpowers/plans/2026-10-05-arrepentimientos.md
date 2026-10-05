# Arrepentimientos (ingesta de buzón + cola de decisión) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leer los mails del Botón de Arrepentimiento (Gmail), cruzar el DNI contra la réplica de GOcelular y darle a Yamila una pestaña "Arrepentimientos" en /compras/envios para confirmar el rescate o descartar.

**Architecture:** Cron (pg_cron → endpoint con CRON_SECRET) lee IMAP en solo-lectura con cursor por UID, filtra mails del botón con tres firmas, deduplica por DNI+orden y guarda solicitudes en Supabase. UI nueva con acciones que reusan `cargarRescate` existente. Lógica pura testeada en `lib/arrepentimientos.ts`.

**Tech Stack:** Next.js 14 (App Router), Supabase (tablas + pg_cron), réplica Postgres de GOcelular (`getPool`), `imapflow` + `mailparser` (nuevas deps), vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-arrepentimientos-design.md`

## Global Constraints

- IMAP SIEMPRE solo-lectura: `getMailboxLock('INBOX', { readOnly: true })`; jamás marcar, mover o borrar mails.
- Credenciales SOLO en env: `MAIL_ARREPENTIMIENTOS_USER` / `MAIL_ARREPENTIMIENTOS_PASS` (.env.local + Vercel). Nunca en el repo ni en el plan de commits.
- Un mail se procesa solo si cumple LAS TRES firmas del botón (from exacto + regex de asunto + marca en el cuerpo).
- Dedupe por DNI + orden (gocuotas_order_id), no por DNI solo.
- Arranque sin backfill: la primera corrida siembra el cursor en el UID más alto y no procesa nada.
- Réplica GOcelular: filtrar propios con `sqlCondicionClientes(CLIENT_IDS_PROPIOS, ...)` — nunca hardcodear client_ids nuevos.
- Textos de UI en español, estilo del repo (tablas compactas, chips, patrón 2 clics para acciones).

## Review Focus

1. **Gmail cambia UIDVALIDITY** (re-indexa el buzón): los UID viejos dejan de valer y un cursor stale saltearía o re-leería mails → el estado guarda `uidvalidity` y si cambia se re-siembra el cursor y se loguea. Test en Task 5 (lógica de seed) + chequeo manual en smoke.
2. **El mail del botón matcheado pero el DNI no existe en la réplica** (cliente de terceros, error de tipeo del cliente): debe crear fila "sin orden", nunca perderse. Test en Task 2 (`decidirAccionMail` con orden null) y Task 7 (render del chip rojo).
3. **Confirmar sin tracking** (solicitud sin despacho): la action debe rechazar con error claro y la UI deshabilitar el botón. Test en Task 2 no aplica → se pinta en Task 6 (action devuelve error) y Task 7 (botón disabled).
4. **`cargarRescate` falla** (tracking no está en GOcelular): la solicitud NO debe quedar `confirmada`. Task 6: la action solo actualiza estado si `cargarRescate` devolvió `ok`.
5. **Cron muere a mitad de lote**: el cursor avanza mail a mail y `email_uid` es unique → la corrida siguiente reintenta sin duplicar. Task 5: orden de operaciones (procesar → avanzar cursor) explícito en el código.

---

### Task 1: Dependencias + tablas en Supabase

**Files:**
- Modify: `package.json` (deps `imapflow`, `mailparser`)
- Create: `scripts/arrepentimientos.sql`

**Interfaces:**
- Produces: tablas `arrepentimientos` y `arrepentimientos_estado` en Supabase (schema exacto abajo), usadas por Tasks 5 y 6.

- [ ] **Step 1: Instalar dependencias**

```bash
cd /home/cremi/consignacion-app && npm install imapflow mailparser --no-fund --no-audit
```

- [ ] **Step 2: Crear el script SQL**

```sql
-- scripts/arrepentimientos.sql
-- Solicitudes del Botón de Arrepentimiento (mails de n8n) + cursor IMAP.
-- Correr en Supabase SQL Editor con nombre "arrepentimientos — tablas".
create table if not exists arrepentimientos (
  id uuid primary key default gen_random_uuid(),
  dni text not null,
  nombre text not null,
  email_uid bigint not null unique,
  email_fecha timestamptz not null,
  order_number text,
  gocuotas_order_id text,
  producto text,
  tracking text,
  otras_ordenes int not null default 0,
  insistencias int not null default 1,
  ultima_insistencia_at timestamptz not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','confirmada','descartada')),
  descarte_motivo text,
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists arrepentimientos_dni_idx on arrepentimientos (dni);
create index if not exists arrepentimientos_estado_idx on arrepentimientos (estado);

create table if not exists arrepentimientos_estado (
  id int primary key default 1 check (id = 1),
  ultimo_uid bigint not null,
  uidvalidity bigint not null,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 3: Aplicar el SQL en Supabase**

Con el pooler (host directo es IPv6-only en WSL). El script es idempotente (`if not exists`):

```bash
node --input-type=module -e "
import { readFileSync } from 'fs'
import pg from 'pg'
const url = readFileSync('.env.local','utf8').match(/^SUPABASE_DB_URL=(.+)\$/m)[1].trim().replace(/^[\"']|[\"']\$/g,'').replace(/\\\\n/g,'')
const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } })
await pool.query(readFileSync('scripts/arrepentimientos.sql','utf8'))
console.log('tablas OK')
await pool.end()"
```

Expected: `tablas OK`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/arrepentimientos.sql
git commit -m "feat(arrepentimientos): deps imap + tablas supabase"
```

---

### Task 2: Lógica pura — parser, firmas del botón y decisión de dedupe

**Files:**
- Create: `lib/arrepentimientos.ts`
- Test: `__tests__/arrepentimientos.test.ts`

**Interfaces:**
- Produces (usadas por Tasks 4, 5):
  - `parsearAsuntoArrepentimiento(asunto: string | null): { nombre: string; dni: string } | null`
  - `esMailDelBoton(m: { from: string | null; asunto: string | null; texto: string | null }): boolean`
  - `interface OrdenDeDni { orderNumber: string | null; gocuotasOrderId: string | null; producto: string | null; tracking: string | null; otrasOrdenes: number }`
  - `type AccionMail = { tipo: 'insistencia'; solicitudId: string } | { tipo: 'ya_solicitado' } | { tipo: 'nueva' }`
  - `decidirAccionMail(args: { orden: OrdenDeDni | null; existentes: { id: string; gocuotasOrderId: string | null }[]; rescateYaSolicitado: boolean }): AccionMail`
  - `MOTIVOS_DESCARTE_ARREPENTIMIENTO = ['Anulada antes del despacho', 'Gestionado por otro canal', 'Otro'] as const`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// __tests__/arrepentimientos.test.ts
import { describe, expect, it } from 'vitest'
import {
  decidirAccionMail,
  esMailDelBoton,
  parsearAsuntoArrepentimiento,
} from '@/lib/arrepentimientos'

describe('parsearAsuntoArrepentimiento', () => {
  it('parsea el formato real de n8n (dobles espacios, tildes, nombres compuestos)', () => {
    expect(parsearAsuntoArrepentimiento('Arrepentimiento —  Martina Zacarias (DNI 30628243)'))
      .toEqual({ nombre: 'Martina Zacarias', dni: '30628243' })
    expect(parsearAsuntoArrepentimiento('Arrepentimiento —  Vanina Gisel Murúa  (DNI 35055134)'))
      .toEqual({ nombre: 'Vanina Gisel Murúa', dni: '35055134' })
    expect(parsearAsuntoArrepentimiento('Arrepentimiento —  Eugenia del valle  Ginard  (DNI 25211770)'))
      .toEqual({ nombre: 'Eugenia del valle Ginard', dni: '25211770' })
    expect(parsearAsuntoArrepentimiento('Arrepentimiento — Andres Castañeda (DNI 34393089)'))
      .toEqual({ nombre: 'Andres Castañeda', dni: '34393089' })
  })

  it('rechaza asuntos que no son del botón', () => {
    expect(parsearAsuntoArrepentimiento('arrepentimiento de mi compra')).toBeNull()
    expect(parsearAsuntoArrepentimiento('Re: Arrepentimiento —  Juan Perez (DNI 11222333)')).toBeNull()
    expect(parsearAsuntoArrepentimiento('Arrepentimiento — Juan Perez (DNI abc)')).toBeNull()
    expect(parsearAsuntoArrepentimiento(null)).toBeNull()
  })
})

describe('esMailDelBoton', () => {
  const base = {
    from: 'gocelulares@gocuotas.com',
    asunto: 'Arrepentimiento —  Erika Ponce (DNI 36227906)',
    texto: 'SOLICITUD DE ARREPENTIMIENTO ... GOcelular Botón de Arrepentimiento',
  }
  it('acepta solo con las tres firmas', () => {
    expect(esMailDelBoton(base)).toBe(true)
  })
  it('rechaza si falla cualquiera de las tres', () => {
    expect(esMailDelBoton({ ...base, from: 'cliente@gmail.com' })).toBe(false)
    expect(esMailDelBoton({ ...base, asunto: 'me arrepentí de la compra' })).toBe(false)
    expect(esMailDelBoton({ ...base, texto: 'hola quiero devolver el celu' })).toBe(false)
    expect(esMailDelBoton({ ...base, texto: null })).toBe(false)
  })
})

describe('decidirAccionMail', () => {
  const orden = { orderNumber: 'SO-X', gocuotasOrderId: '123', producto: 'Moto G17', tracking: '360001', otrasOrdenes: 0 }
  it('misma orden ya solicitada → insistencia (cualquier estado)', () => {
    expect(decidirAccionMail({ orden, existentes: [{ id: 'a1', gocuotasOrderId: '123' }], rescateYaSolicitado: false }))
      .toEqual({ tipo: 'insistencia', solicitudId: 'a1' })
  })
  it('sin orden matcheada y ya hay solicitud sin orden del mismo DNI → insistencia', () => {
    expect(decidirAccionMail({ orden: null, existentes: [{ id: 'a2', gocuotasOrderId: null }], rescateYaSolicitado: false }))
      .toEqual({ tipo: 'insistencia', solicitudId: 'a2' })
  })
  it('orden nueva de un DNI con solicitud vieja de OTRA orden → nueva', () => {
    expect(decidirAccionMail({ orden, existentes: [{ id: 'a3', gocuotasOrderId: '999' }], rescateYaSolicitado: false }))
      .toEqual({ tipo: 'nueva' })
  })
  it('rescate ya solicitado por otro canal → ya_solicitado', () => {
    expect(decidirAccionMail({ orden, existentes: [], rescateYaSolicitado: true }))
      .toEqual({ tipo: 'ya_solicitado' })
  })
  it('DNI sin orden y sin solicitudes previas → nueva (fila "sin orden")', () => {
    expect(decidirAccionMail({ orden: null, existentes: [], rescateYaSolicitado: false }))
      .toEqual({ tipo: 'nueva' })
  })
})
```

- [ ] **Step 2: Verificar que fallan**

```bash
cd /home/cremi/consignacion-app && npx vitest run __tests__/arrepentimientos.test.ts
```

Expected: FAIL (`Cannot find package '@/lib/arrepentimientos'` o símbolos inexistentes)

- [ ] **Step 3: Implementar la lógica pura**

```ts
// lib/arrepentimientos.ts
// Lógica pura de la ingesta de arrepentimientos (mails del botón de n8n).
// El cron (app/api/cron/arrepentimientos) y las actions orquestan IO; acá
// viven el parser del asunto, las firmas del botón y la decisión de dedupe.

export const REMITENTE_BOTON = 'gocelulares@gocuotas.com'
export const MARCA_BOTON = 'GOcelular Botón de Arrepentimiento'
export const MOTIVOS_DESCARTE_ARREPENTIMIENTO = [
  'Anulada antes del despacho',
  'Gestionado por otro canal',
  'Otro',
] as const
export type MotivoDescarteArrepentimiento = (typeof MOTIVOS_DESCARTE_ARREPENTIMIENTO)[number]

// Formato real de n8n: "Arrepentimiento —  Nombre Apellido (DNI 12345678)"
// (dobles espacios y espacios antes del paréntesis vistos en mails reales)
const RE_ASUNTO = /^Arrepentimiento\s*—\s*(.+?)\s*\(DNI\s*(\d{6,9})\)\s*$/

export function parsearAsuntoArrepentimiento(asunto: string | null): { nombre: string; dni: string } | null {
  const m = (asunto ?? '').trim().match(RE_ASUNTO)
  if (!m) return null
  return { nombre: m[1].replace(/\s+/g, ' ').trim(), dni: m[2] }
}

// Las TRES firmas a la vez: remitente exacto + asunto con formato estricto +
// marca del workflow de n8n en el cuerpo. Un mail escrito a mano falla todas.
export function esMailDelBoton(m: { from: string | null; asunto: string | null; texto: string | null }): boolean {
  if ((m.from ?? '').toLowerCase() !== REMITENTE_BOTON) return false
  if (!parsearAsuntoArrepentimiento(m.asunto)) return false
  return (m.texto ?? '').includes(MARCA_BOTON)
}

export interface OrdenDeDni {
  orderNumber: string | null
  gocuotasOrderId: string | null
  producto: string | null
  tracking: string | null
  otrasOrdenes: number
}

export type AccionMail =
  | { tipo: 'insistencia'; solicitudId: string }
  | { tipo: 'ya_solicitado' }
  | { tipo: 'nueva' }

// Dedupe por DNI + ORDEN (no por DNI solo): el mismo cliente puede comprar
// de nuevo más adelante y arrepentirse de la orden nueva — eso es una
// solicitud nueva. `existentes` = solicitudes previas del MISMO dni.
export function decidirAccionMail(args: {
  orden: OrdenDeDni | null
  existentes: { id: string; gocuotasOrderId: string | null }[]
  rescateYaSolicitado: boolean
}): AccionMail {
  const idOrden = args.orden?.gocuotasOrderId ?? null
  const previa = args.existentes.find(e => e.gocuotasOrderId === idOrden)
  if (previa) return { tipo: 'insistencia', solicitudId: previa.id }
  if (args.rescateYaSolicitado) return { tipo: 'ya_solicitado' }
  return { tipo: 'nueva' }
}
```

- [ ] **Step 4: Verificar que pasan**

```bash
npx vitest run __tests__/arrepentimientos.test.ts
```

Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add lib/arrepentimientos.ts __tests__/arrepentimientos.test.ts
git commit -m "feat(arrepentimientos): parser de asunto, firmas del boton y dedupe por dni+orden"
```

---

### Task 3: Cruce DNI → orden en la réplica

**Files:**
- Modify: `lib/gocelular.ts` (agregar al final, antes de los helpers finales si los hay)

**Interfaces:**
- Consumes: `OrdenDeDni` de `lib/arrepentimientos.ts` (Task 2); `getPool`, `SQL_IDS_PROPIOS`/`sqlCondicionClientes` ya existentes en el archivo.
- Produces (usada por Task 5): `fetchOrdenPorDni(dni: string): Promise<OrdenDeDni | null>` — null = DNI sin órdenes propias activas; si hay varias devuelve la más reciente con `otrasOrdenes = n-1`. También `fetchRescateYaSolicitado(tracking: string): Promise<boolean>`.

- [ ] **Step 1: Implementar los fetch**

En `lib/gocelular.ts`, importar el tipo arriba (`import type { OrdenDeDni } from '@/lib/arrepentimientos'`) y agregar:

```ts
// ---------------------------------------------------------------------------
// Arrepentimientos: cruce DNI → orden propia más reciente (ver spec
// docs/superpowers/specs/2026-10-05-arrepentimientos-design.md)
// ---------------------------------------------------------------------------

export async function fetchOrdenPorDni(dni: string): Promise<OrdenDeDni | null> {
  const pool = getPool()
  if (!pool || !/^\d{6,9}$/.test(dni)) return null
  const client = await pool.connect()
  try {
    const res = await client.query<{
      order_number: string | null
      gocuotas_order_id: string
      producto: string | null
      tracking: string | null
      total: string
    }>(
      `SELECT so.order_number,
              go.order_id::text AS gocuotas_order_id,
              so.product_name AS producto,
              (SELECT s.tracking_number FROM shipments s
                WHERE s.store_order_id = so.id
                ORDER BY s.created_at DESC LIMIT 1) AS tracking,
              count(*) OVER ()::text AS total
       FROM gocuotas_orders go
       LEFT JOIN store_orders so ON so.gocuotas_order_id::text = go.order_id::text
       WHERE go.user_dni = $1
         AND go.order_discarded_at IS NULL
         AND go.client_id::text IN (${SQL_IDS_PROPIOS})
       ORDER BY go.order_created_at DESC
       LIMIT 1`,
      [dni]
    )
    const r = res.rows[0]
    if (!r) return null
    return {
      orderNumber: r.order_number,
      gocuotasOrderId: r.gocuotas_order_id,
      producto: r.producto,
      tracking: r.tracking,
      otrasOrdenes: Number(r.total) - 1,
    }
  } finally {
    client.release()
  }
}

/** ¿El envío ya tiene SolicitudDeRescate en el tracking de Andreani? */
export async function fetchRescateYaSolicitado(tracking: string): Promise<boolean> {
  const pool = getPool()
  if (!pool) return false
  const client = await pool.connect()
  try {
    const res = await client.query(
      `SELECT 1 FROM shipments s
       WHERE s.tracking_number = $1 AND s.traces::text ILIKE '%SolicitudDeRescate%'
       LIMIT 1`,
      [tracking]
    )
    return res.rows.length > 0
  } finally {
    client.release()
  }
}
```

Nota: si en `lib/gocelular.ts` el identificador de propios se llama distinto (`SQL_IDS_PROPIOS` viene de `lib/client-ids.ts` y ya se usa en `fetchVentasPorMarca`), copiar la forma exacta de ese uso existente.

- [ ] **Step 2: Verificar contra la réplica con DNIs reales**

```bash
node --input-type=module -e "
const { fetchOrdenPorDni, fetchRescateYaSolicitado } = await import('./lib/gocelular.ts').catch(() => process.exit(0))
" 2>/dev/null || npx tsx -e "
import { fetchOrdenPorDni } from './lib/gocelular'
console.log(await fetchOrdenPorDni('40003907'))  // Gimena Quiroga: orden sin tracking
console.log(await fetchOrdenPorDni('35055134'))  // Vanina Murúa: con tracking
console.log(await fetchOrdenPorDni('00000001'))  // inexistente: null
"
```

Si `tsx` no está disponible, verificar con `npx tsc --noEmit` + un probe equivalente en SQL crudo (mismas queries con los 3 DNIs). Expected: Gimena con `tracking: null`, Vanina con tracking `360003119029200`, inexistente `null`.

- [ ] **Step 3: Typecheck y commit**

```bash
npx tsc --noEmit && git add lib/gocelular.ts && git commit -m "feat(arrepentimientos): fetchOrdenPorDni y chequeo de rescate ya solicitado"
```

---

### Task 4: Cliente IMAP de solo lectura

**Files:**
- Create: `lib/arrepentimientos-mail.ts`

**Interfaces:**
- Consumes: `esMailDelBoton`, `parsearAsuntoArrepentimiento` (Task 2); env `MAIL_ARREPENTIMIENTOS_USER/PASS`.
- Produces (usada por Task 5):
  - `interface MailBoton { uid: number; fecha: string; nombre: string; dni: string }`
  - `leerMailsNuevos(desdeUid: number): Promise<{ mails: MailBoton[]; maxUid: number; uidValidity: number; descartadosFiltro: number }>` — `maxUid` = UID más alto visto (para sembrar/avanzar cursor incluso sin mails del botón).

- [ ] **Step 1: Implementar el cliente**

```ts
// lib/arrepentimientos-mail.ts
// Lectura SOLO-LECTURA del buzón del Botón de Arrepentimiento. Nunca marca,
// mueve ni borra mails. El cursor por UID lo maneja el cron.
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { esMailDelBoton, parsearAsuntoArrepentimiento } from '@/lib/arrepentimientos'

export interface MailBoton {
  uid: number
  fecha: string // ISO del Date del mail
  nombre: string
  dni: string
}

export async function leerMailsNuevos(desdeUid: number): Promise<{
  mails: MailBoton[]
  maxUid: number
  uidValidity: number
  descartadosFiltro: number
}> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.MAIL_ARREPENTIMIENTOS_USER ?? '',
      pass: process.env.MAIL_ARREPENTIMIENTOS_PASS ?? '',
    },
    logger: false,
  })
  await client.connect()
  const lock = await client.getMailboxLock('INBOX', { readOnly: true })
  try {
    const uidValidity = Number(client.mailbox && typeof client.mailbox === 'object' ? client.mailbox.uidValidity : 0)
    let maxUid = desdeUid
    const mails: MailBoton[] = []
    let descartadosFiltro = 0

    // SUBJECT de IMAP es substring case-insensitive; el filtro fino (las tres
    // firmas) corre después sobre el mail parseado.
    const uids = await client.search(
      { header: { subject: 'Arrepentimiento' }, uid: `${desdeUid + 1}:*` },
      { uid: true }
    )
    // Gmail devuelve el último UID del buzón aunque sea < desdeUid+1: filtrar.
    const nuevos = (uids || []).filter(u => u > desdeUid).sort((a, b) => a - b)

    for (const uid of nuevos) {
      const { content } = await client.download(String(uid), undefined, { uid: true })
      const parsed = await simpleParser(content)
      maxUid = Math.max(maxUid, uid)
      const from = parsed.from?.value?.[0]?.address ?? null
      const asunto = parsed.subject ?? null
      const texto = parsed.text ?? null
      if (!esMailDelBoton({ from, asunto, texto })) {
        descartadosFiltro++
        continue
      }
      const datos = parsearAsuntoArrepentimiento(asunto)!
      mails.push({
        uid,
        fecha: (parsed.date ?? new Date()).toISOString(),
        nombre: datos.nombre,
        dni: datos.dni,
      })
    }
    return { mails, maxUid, uidValidity, descartadosFiltro }
  } finally {
    lock.release()
    await client.logout()
  }
}

/** UID más alto del buzón + uidValidity, para sembrar el cursor sin backfill. */
export async function leerEstadoBuzon(): Promise<{ maxUid: number; uidValidity: number }> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.MAIL_ARREPENTIMIENTOS_USER ?? '',
      pass: process.env.MAIL_ARREPENTIMIENTOS_PASS ?? '',
    },
    logger: false,
  })
  await client.connect()
  const lock = await client.getMailboxLock('INBOX', { readOnly: true })
  try {
    const mb = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null
    return {
      maxUid: mb ? Number(mb.uidNext) - 1 : 0,
      uidValidity: mb ? Number(mb.uidValidity) : 0,
    }
  } finally {
    lock.release()
    await client.logout()
  }
}
```

- [ ] **Step 2: Agregar credenciales a .env.local**

Agregar a `.env.local` (NO al repo) las dos variables con los valores que pasó Emiliano en la sesión:

```
MAIL_ARREPENTIMIENTOS_USER="gocelulares@gocuotas.com"
MAIL_ARREPENTIMIENTOS_PASS="<app password de 16 letras, sin espacios>"
```

- [ ] **Step 3: Probe real de solo lectura**

```bash
npx tsx -e "
import { leerEstadoBuzon, leerMailsNuevos } from './lib/arrepentimientos-mail'
const estado = await leerEstadoBuzon()
console.log('estado buzón:', estado)
const lote = await leerMailsNuevos(estado.maxUid - 20)
console.log('mails del botón en los últimos 20 UID:', lote.mails.length, '| descartados filtro:', lote.descartadosFiltro)
console.log(lote.mails.slice(0, 3))
"
```

Expected: estado con `maxUid` ≈ 1960+ y mails parseados con nombre/dni. (Si `tsx` no existe: `npm i -D tsx` primero.)

- [ ] **Step 4: Typecheck y commit**

```bash
npx tsc --noEmit && git add lib/arrepentimientos-mail.ts && git commit -m "feat(arrepentimientos): cliente imap solo-lectura con filtro de firmas"
```

---

### Task 5: Cron de ingesta

**Files:**
- Create: `app/api/cron/arrepentimientos/route.ts`
- Modify: `scripts/arrepentimientos.sql` (agregar el job de pg_cron comentado al final)

**Interfaces:**
- Consumes: `leerMailsNuevos`, `leerEstadoBuzon` (Task 4); `fetchOrdenPorDni`, `fetchRescateYaSolicitado` (Task 3); `decidirAccionMail` (Task 2); `createAdminClient`; tablas de Task 1.
- Produces: `GET /api/cron/arrepentimientos` con `Authorization: Bearer CRON_SECRET`. Respuesta JSON `{ ok, resultado, nuevos?, insistencias?, yaSolicitados?, descartadosFiltro? }`.

- [ ] **Step 1: Implementar la ruta**

```ts
// app/api/cron/arrepentimientos/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decidirAccionMail } from '@/lib/arrepentimientos'
import { leerEstadoBuzon, leerMailsNuevos } from '@/lib/arrepentimientos-mail'
import { fetchOrdenPorDni, fetchRescateYaSolicitado } from '@/lib/gocelular'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Ingesta del Botón de Arrepentimiento (ver spec 2026-10-05). Corre por
// pg_cron cada 30 min. Primera corrida (sin fila de estado) o cambio de
// UIDVALIDITY de Gmail: siembra el cursor en el UID más alto y NO procesa
// nada (arranque sin backfill). El cursor avanza mail a mail: si el proceso
// muere a mitad de lote, la corrida siguiente reintenta sin duplicar
// (email_uid es unique).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: estado } = await admin
    .from('arrepentimientos_estado')
    .select('ultimo_uid, uidvalidity')
    .eq('id', 1)
    .maybeSingle()

  const buzon = await leerEstadoBuzon()
  if (!estado || Number(estado.uidvalidity) !== buzon.uidValidity) {
    const { error } = await admin.from('arrepentimientos_estado').upsert({
      id: 1,
      ultimo_uid: buzon.maxUid,
      uidvalidity: buzon.uidValidity,
      updated_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ ok: false, resultado: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true,
      resultado: estado
        ? `UIDVALIDITY cambió (${estado.uidvalidity} → ${buzon.uidValidity}): cursor re-sembrado en ${buzon.maxUid}`
        : `cursor sembrado en UID ${buzon.maxUid} — sin backfill`,
    })
  }

  const lote = await leerMailsNuevos(Number(estado.ultimo_uid))
  let nuevos = 0
  let insistencias = 0
  let yaSolicitados = 0

  for (const mail of lote.mails) {
    const orden = await fetchOrdenPorDni(mail.dni)
    const { data: existentes } = await admin
      .from('arrepentimientos')
      .select('id, gocuotas_order_id')
      .eq('dni', mail.dni)
    const rescateYaSolicitado = orden?.tracking
      ? (await fetchRescateYaSolicitado(orden.tracking)) ||
        (await admin.from('rescates_seguimiento').select('tracking').eq('tracking', orden.tracking).maybeSingle()).data !== null
      : false

    const accion = decidirAccionMail({
      orden,
      existentes: (existentes ?? []).map(e => ({ id: e.id, gocuotasOrderId: e.gocuotas_order_id })),
      rescateYaSolicitado,
    })

    if (accion.tipo === 'insistencia') {
      // Incremento leer+escribir: con 5-10 mails/día y un solo cron no hay carrera
      const { data: fila } = await admin.from('arrepentimientos').select('insistencias').eq('id', accion.solicitudId).single()
      const { error: err2 } = await admin
        .from('arrepentimientos')
        .update({ insistencias: (fila?.insistencias ?? 1) + 1, ultima_insistencia_at: mail.fecha })
        .eq('id', accion.solicitudId)
      if (err2) return NextResponse.json({ ok: false, resultado: err2.message }, { status: 500 })
      insistencias++
    } else if (accion.tipo === 'nueva') {
      const { error } = await admin.from('arrepentimientos').insert({
        dni: mail.dni,
        nombre: mail.nombre,
        email_uid: mail.uid,
        email_fecha: mail.fecha,
        order_number: orden?.orderNumber ?? null,
        gocuotas_order_id: orden?.gocuotasOrderId ?? null,
        producto: orden?.producto ?? null,
        tracking: orden?.tracking ?? null,
        otras_ordenes: orden?.otrasOrdenes ?? 0,
        ultima_insistencia_at: mail.fecha,
      })
      // 23505 = unique violation en email_uid: reintento de un lote caído, seguir
      if (error && !error.message.includes('duplicate')) {
        return NextResponse.json({ ok: false, resultado: error.message }, { status: 500 })
      }
      nuevos++
    } else {
      yaSolicitados++
    }

    // Avanzar el cursor DESPUÉS de procesar este mail
    const { error: errCursor } = await admin
      .from('arrepentimientos_estado')
      .update({ ultimo_uid: mail.uid, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (errCursor) return NextResponse.json({ ok: false, resultado: errCursor.message }, { status: 500 })
  }

  // Si solo hubo mails descartados por filtro, avanzar el cursor igual
  if (lote.maxUid > Number(estado.ultimo_uid)) {
    await admin
      .from('arrepentimientos_estado')
      .update({ ultimo_uid: lote.maxUid, updated_at: new Date().toISOString() })
      .eq('id', 1)
  }

  return NextResponse.json({
    ok: true,
    resultado: `procesados ${lote.mails.length} mails del botón`,
    nuevos,
    insistencias,
    yaSolicitados,
    descartadosFiltro: lote.descartadosFiltro,
  })
}
```

- [ ] **Step 2: Agregar el job de pg_cron al script SQL**

Al final de `scripts/arrepentimientos.sql`:

```sql
-- Job de pg_cron (correr una vez en Supabase SQL Editor, nombre
-- "arrepentimientos — cron"). Reemplazar <CRON_SECRET> por el valor real:
-- select cron.schedule(
--   'arrepentimientos-ingesta',
--   '*/30 * * * *',
--   $$ select net.http_get(
--        url := 'https://gocelular360.vercel.app/api/cron/arrepentimientos',
--        headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
--        timeout_milliseconds := 55000
--      ) $$
-- );
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/arrepentimientos/route.ts scripts/arrepentimientos.sql
git commit -m "feat(arrepentimientos): cron de ingesta con cursor por uid y siembra sin backfill"
```

---

### Task 6: Server actions de la cola

**Files:**
- Create: `lib/actions/arrepentimientos.ts`

**Interfaces:**
- Consumes: `cargarRescate` (lib/actions/rescates.ts), `createAdminClient`, `MOTIVOS_DESCARTE_ARREPENTIMIENTO` (Task 2).
- Produces (usadas por Task 7):
  - `interface SolicitudArrepentimiento { id: string; dni: string; nombre: string; emailFecha: string; orderNumber: string | null; gocuotasOrderId: string | null; producto: string | null; tracking: string | null; otrasOrdenes: number; insistencias: number; ultimaInsistenciaAt: string; estado: 'pendiente' | 'confirmada' | 'descartada'; descarteMotivo: string | null; resueltoAt: string | null }`
  - `getArrepentimientos(): Promise<SolicitudArrepentimiento[]>` (todas, pendientes primero por fecha asc)
  - `confirmarArrepentimiento(id: string): Promise<{ ok?: true; error?: string }>`
  - `descartarArrepentimiento(id: string, motivo: string): Promise<{ ok?: true; error?: string }>`

- [ ] **Step 1: Implementar las actions**

```ts
// lib/actions/arrepentimientos.ts
'use server'

// Cola de arrepentimientos (pestaña Arrepentimientos de /compras/envios).
// Confirmar reusa cargarRescate (motivo 'Arrepentimiento') → el rescate
// entra al flujo normal de la pestaña Rescates. Descartar es soft-delete:
// la fila queda para el dedupe del cron.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { cargarRescate } from '@/lib/actions/rescates'
import { MOTIVOS_DESCARTE_ARREPENTIMIENTO } from '@/lib/arrepentimientos'

export interface SolicitudArrepentimiento {
  id: string
  dni: string
  nombre: string
  emailFecha: string
  orderNumber: string | null
  gocuotasOrderId: string | null
  producto: string | null
  tracking: string | null
  otrasOrdenes: number
  insistencias: number
  ultimaInsistenciaAt: string
  estado: 'pendiente' | 'confirmada' | 'descartada'
  descarteMotivo: string | null
  resueltoAt: string | null
}

export async function getArrepentimientos(): Promise<SolicitudArrepentimiento[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('arrepentimientos')
    .select('*')
    .order('email_fecha', { ascending: true })
  return (data ?? []).map(r => ({
    id: r.id,
    dni: r.dni,
    nombre: r.nombre,
    emailFecha: r.email_fecha,
    orderNumber: r.order_number,
    gocuotasOrderId: r.gocuotas_order_id,
    producto: r.producto,
    tracking: r.tracking,
    otrasOrdenes: r.otras_ordenes,
    insistencias: r.insistencias,
    ultimaInsistenciaAt: r.ultima_insistencia_at,
    estado: r.estado,
    descarteMotivo: r.descarte_motivo,
    resueltoAt: r.resuelto_at,
  }))
}

export async function confirmarArrepentimiento(id: string): Promise<{ ok?: true; error?: string }> {
  const admin = createAdminClient()
  const { data: fila } = await admin.from('arrepentimientos').select('tracking, estado').eq('id', id).single()
  if (!fila) return { error: 'Solicitud no encontrada.' }
  if (fila.estado !== 'pendiente') return { error: 'La solicitud ya fue resuelta.' }
  if (!fila.tracking) return { error: 'Sin despacho: no hay envío para rescatar — anulá la orden y descartá la solicitud.' }

  const res = await cargarRescate(fila.tracking, 'Arrepentimiento')
  if (res.error) return { error: res.error }

  const { error } = await admin
    .from('arrepentimientos')
    .update({ estado: 'confirmada', resuelto_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/compras/envios')
  return { ok: true }
}

export async function descartarArrepentimiento(id: string, motivo: string): Promise<{ ok?: true; error?: string }> {
  if (!(MOTIVOS_DESCARTE_ARREPENTIMIENTO as readonly string[]).includes(motivo)) {
    return { error: 'Elegí un motivo del desplegable.' }
  }
  const admin = createAdminClient()
  const { data: fila } = await admin.from('arrepentimientos').select('estado').eq('id', id).single()
  if (!fila) return { error: 'Solicitud no encontrada.' }
  if (fila.estado !== 'pendiente') return { error: 'La solicitud ya fue resuelta.' }

  const { error } = await admin
    .from('arrepentimientos')
    .update({ estado: 'descartada', descarte_motivo: motivo, resuelto_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/compras/envios')
  return { ok: true }
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
npx tsc --noEmit && git add lib/actions/arrepentimientos.ts && git commit -m "feat(arrepentimientos): actions de cola — confirmar (reusa cargarRescate) y descartar"
```

---

### Task 7: Pestaña Arrepentimientos en /compras/envios

**Files:**
- Create: `app/(admin)/compras/envios/ArrepentimientosTable.tsx`
- Modify: `app/(admin)/compras/envios/page.tsx` (agregar fetch + tab entre "Demoras de entrega" y "Rescates")

**Interfaces:**
- Consumes: `getArrepentimientos`, `confirmarArrepentimiento`, `descartarArrepentimiento`, tipo `SolicitudArrepentimiento` (Task 6); `MOTIVOS_DESCARTE_ARREPENTIMIENTO` (Task 2); patrón de tabs de `EnviosTabs` (id + label con contador).

- [ ] **Step 1: Crear la tabla cliente**

```tsx
// app/(admin)/compras/envios/ArrepentimientosTable.tsx
'use client'

// Cola del Botón de Arrepentimiento: pendientes arriba (más viejo primero,
// es una cola), resueltas colapsadas abajo. Acciones en 2 pasos (clic arma,
// segundo clic ejecuta — patrón DemorasTable).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  confirmarArrepentimiento,
  descartarArrepentimiento,
  type SolicitudArrepentimiento,
} from '@/lib/actions/arrepentimientos'
import { MOTIVOS_DESCARTE_ARREPENTIMIENTO } from '@/lib/arrepentimientos'

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ArrepentimientosTable({ solicitudes }: { solicitudes: SolicitudArrepentimiento[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [armada, setArmada] = useState<{ id: string; accion: 'confirmar' | 'descartar' } | null>(null)
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DESCARTE_ARREPENTIMIENTO[0])
  const [error, setError] = useState<string | null>(null)
  const [verResueltas, setVerResueltas] = useState(false)

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente')
  const resueltas = solicitudes.filter(s => s.estado !== 'pendiente').reverse()

  const ejecutar = (s: SolicitudArrepentimiento, accion: 'confirmar' | 'descartar') => {
    if (armada?.id !== s.id || armada.accion !== accion) {
      setArmada({ id: s.id, accion })
      setError(null)
      return
    }
    startTransition(async () => {
      const res =
        accion === 'confirmar'
          ? await confirmarArrepentimiento(s.id)
          : await descartarArrepentimiento(s.id, motivo)
      if (res.error) setError(res.error)
      else {
        setArmada(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-4 pt-4">
          <h2 className="text-sm font-semibold text-gray-900">Solicitudes pendientes ({pendientes.length})</h2>
          <p className="text-xs text-gray-400 mb-2">
            Mails del Botón de Arrepentimiento, cargados automáticamente cada 30 min. Confirmar crea el
            rescate (pestaña Rescates); si no hay despacho, anulá la orden en GOcuotas y descartá.
          </p>
        </div>
        {pendientes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin solicitudes pendientes 🎉</p>
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="text-left px-4 py-3">Solicitud</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Pedido · Order ID</th>
                <th className="text-left px-4 py-3">Producto</th>
                <th className="text-left px-4 py-3">Envío</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendientes.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs">
                    {fechaCorta(s.emailFecha)}
                    {s.insistencias > 1 && (
                      <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                        insistió ×{s.insistencias}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{s.nombre}</span>
                    <span className="text-gray-400 text-xs ml-1.5">DNI {s.dni}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {s.orderNumber ? (
                      <>
                        {s.orderNumber}
                        {s.gocuotasOrderId && <span className="text-gray-500"> · {s.gocuotasOrderId}</span>}
                        {s.otrasOrdenes > 0 && (
                          <span className="ml-1.5 font-sans text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                            ⚠ +{s.otrasOrdenes} órdenes
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-sans text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1">
                        sin orden encontrada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{s.producto ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {s.tracking ? (
                      <a
                        href={`https://www.andreani.com/envio/${s.tracking}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline font-mono"
                      >
                        {s.tracking}
                      </a>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                        sin despachar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => ejecutar(s, 'confirmar')}
                      disabled={!s.tracking || isPending}
                      title={s.tracking ? 'Crear el rescate en Andreani (pestaña Rescates)' : 'Sin despacho: anular la orden y descartar'}
                      className={`text-xs font-medium rounded-lg px-2.5 py-1 mr-1.5 transition-colors ${
                        armada?.id === s.id && armada.accion === 'confirmar'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40'
                      }`}
                    >
                      {armada?.id === s.id && armada.accion === 'confirmar' ? '¿Confirmar rescate?' : 'Confirmar'}
                    </button>
                    {armada?.id === s.id && armada.accion === 'descartar' && (
                      <select
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 mr-1.5"
                      >
                        {MOTIVOS_DESCARTE_ARREPENTIMIENTO.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => ejecutar(s, 'descartar')}
                      disabled={isPending}
                      className={`text-xs font-medium rounded-lg px-2.5 py-1 transition-colors ${
                        armada?.id === s.id && armada.accion === 'descartar'
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {armada?.id === s.id && armada.accion === 'descartar' ? '¿Descartar?' : 'Descartar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={() => setVerResueltas(v => !v)}
          className="w-full text-left px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          {verResueltas ? '▾' : '▸'} Resueltas ({resueltas.length})
        </button>
        {verResueltas && resueltas.length > 0 && (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {resueltas.map(s => (
                <tr key={s.id} className="text-gray-500">
                  <td className="px-4 py-2 text-xs">{fechaCorta(s.emailFecha)}</td>
                  <td className="px-4 py-2 text-xs">{s.nombre} · DNI {s.dni}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.orderNumber ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    {s.estado === 'confirmada' ? (
                      <span className="text-emerald-700">✓ rescate confirmado</span>
                    ) : (
                      <span>descartada — {s.descarteMotivo}</span>
                    )}
                    {s.resueltoAt && <span className="text-gray-400"> · {fechaCorta(s.resueltoAt)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sumar la pestaña en page.tsx**

En `app/(admin)/compras/envios/page.tsx`:
1. `import { getArrepentimientos } from '@/lib/actions/arrepentimientos'` y `import ArrepentimientosTable from './ArrepentimientosTable'`.
2. Agregar `getArrepentimientos()` al `Promise.all` existente (donde ya está `getRescatesCompletos()`), guardando en `arrepentimientos`.
3. `const arrepPendientes = arrepentimientos.filter(a => a.estado === 'pendiente').length`
4. Insertar la tab ENTRE "Demoras de entrega" y "Rescates":

```tsx
{
  id: 'arrepentimientos',
  label: arrepPendientes > 0 ? `Arrepentimientos (${arrepPendientes})` : 'Arrepentimientos',
  content: <ArrepentimientosTable solicitudes={arrepentimientos} />,
},
```

- [ ] **Step 3: Typecheck + suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: sin errores, todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/compras/envios/ArrepentimientosTable.tsx app/\(admin\)/compras/envios/page.tsx
git commit -m "feat(arrepentimientos): pestaña con cola de decision en /compras/envios"
```

---

### Task 8: Order ID junto al pedido en la tabla Rescates

**Files:**
- Modify: `app/(admin)/compras/envios/RescatesTable.tsx` (header ~línea 279, celda ~línea 301, celda del pedido ~línea 291)

**Interfaces:**
- Consumes: `Rescate.gocuotasOrderId` (ya existe en el tipo).

- [ ] **Step 1: Fusionar columnas**

En `RescatesTable.tsx`: eliminar el `<th>Order ID</th>` del final y su `<td>` correspondiente; cambiar la celda del pedido a:

```tsx
<td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
  {r.orderNumber}
  {r.gocuotasOrderId && <span className="text-gray-500 font-normal"> · {r.gocuotasOrderId}</span>}
</td>
```

y el header de esa columna a `Pedido · Order ID` (respetando las clases existentes del header).

- [ ] **Step 2: Typecheck y commit**

```bash
npx tsc --noEmit && git add app/\(admin\)/compras/envios/RescatesTable.tsx
git commit -m "feat(rescates): order id de gocuotas junto al numero de pedido"
```

---

### Task 9: Env en Vercel, pg_cron, deploy y smoke E2E

**Files:**
- Ninguno nuevo (operaciones).

**Interfaces:**
- Consumes: todo lo anterior deployado.

- [ ] **Step 1: Cargar env en Vercel**

```bash
cd /home/cremi/consignacion-app
printf 'gocelulares@gocuotas.com' | npx vercel env add MAIL_ARREPENTIMIENTOS_USER production
printf '<app password sin espacios>' | npx vercel env add MAIL_ARREPENTIMIENTOS_PASS production
```

- [ ] **Step 2: Deploy**

```bash
npx vercel --prod
```

Expected: `Deployment ... ready` (git push NO deploya — siempre `npx vercel --prod`).

- [ ] **Step 3: Siembra del cursor (primera corrida)**

```bash
CRON=$(grep -E '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"')
curl -s -H "Authorization: Bearer $CRON" "https://gocelular360.vercel.app/api/cron/arrepentimientos" | head -c 300
```

Expected: `{"ok":true,"resultado":"cursor sembrado en UID ..."}`.

- [ ] **Step 4: Smoke de ingesta real**

Esperar (o pedirle a Emiliano que genere) un mail nuevo del botón, re-correr el curl del Step 3 y verificar `{"ok":true,...,"nuevos":1}`. Después abrir `/compras/envios?tab=arrepentimientos` (smoke autenticado con la cookie de password grant, patrón conocido) y verificar la fila: cliente, DNI, pedido·orderId, envío. Alternativa sin esperar mail nuevo: correr una vez con el cursor retrocedido a mano (`update arrepentimientos_estado set ultimo_uid = ultimo_uid - 20`) para ingerir los últimos mails reales, verificar las filas, y avisar a Emiliano que son históricos de prueba (puede descartarlas con motivo "Otro" o las dejamos como primeras filas reales de la cola).

- [ ] **Step 5: Programar el pg_cron**

Correr en Supabase SQL Editor (query nombrada "arrepentimientos — cron", regla del repo) el `cron.schedule` comentado en `scripts/arrepentimientos.sql`, con el `CRON_SECRET` real. Verificar: `select jobname, schedule, active from cron.job;` debe listar `arrepentimientos-ingesta`.

- [ ] **Step 6: Commit final + actualizar ficha de memoria del proyecto**

```bash
git add -A && git commit -m "feat(arrepentimientos): ingesta automatica del buzon + cola de decision para operaciones" --allow-empty && git push
```

Actualizar la ficha `project_consignacion.md` (memoria) con: pestaña nueva, tablas, cron, credenciales en env, y el pendiente v2 (anular orden por API).
