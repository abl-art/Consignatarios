# Celia (Asistente AI) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página de chat "/celia" en el panel admin donde el admin pregunta en lenguaje natural y un agente Claude responde consultando las bases de datos con SQL de solo lectura.

**Architecture:** Loop agéntico en un route handler de Next.js (`/api/celia/chat`) que streamea SSE al cliente. Claude Opus 5 recibe dos tools SQL (DB externa GOcelular + Supabase) con guardrails en código, y un system prompt con el esquema y reglas de negocio (cacheado). Historial persistido en Supabase.

**Tech Stack:** Next.js 14 (App Router), `@anthropic-ai/sdk` v0.112 (ya instalado), `pg` (ya instalado), Supabase, `react-markdown` + `remark-gfm` (a instalar), vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-celia-chat-design.md`

## Global Constraints

- Modelo: `claude-opus-5` exacto. NO usar sonnet/haiku, NO agregar sufijos de fecha.
- SDK: usar `@anthropic-ai/sdk` ya instalado; nunca fetch crudo a la API de Anthropic.
- Solo admin: toda ruta/acción verifica `user.user_metadata?.rol === 'admin'` (patrón de `app/(admin)/layout.tsx:37-39`).
- SQL: solo SELECT/WITH, una sentencia, máx 500 filas, timeout 15s — validado en código, nunca confiar en el modelo.
- Textos de UI en español. Estilo Finanzas: tablas compactas, botones `bg-gray-900`.
- NUNCA commitear credenciales (el `.env.local` ya está en .gitignore).
- Antes de cada commit: `npx tsc --noEmit` limpio.

---

### Task 1: Guardrails SQL (validador + ejecutor)

**Files:**
- Create: `lib/celia/sql.ts`
- Test: `__tests__/celia-sql.test.ts`

**Interfaces:**
- Produces: `validarSelect(sql: string): { ok: true } | { ok: false; error: string }`
- Produces: `ejecutarConsulta(pool: Pool, sql: string): Promise<{ filas: Record<string, unknown>[]; truncado: boolean }>` — lanza `Error` si la validación falla o la query da error.
- Produces: `serializarFilas(filas: Record<string, unknown>[]): string` — JSON seguro (Date→ISO, BigInt→string).

- [ ] **Step 1: Escribir tests que fallan**

```typescript
// __tests__/celia-sql.test.ts
import { describe, it, expect } from 'vitest'
import { validarSelect, serializarFilas } from '@/lib/celia/sql'

describe('validarSelect', () => {
  it('acepta un SELECT simple', () => {
    expect(validarSelect('SELECT * FROM ventas').ok).toBe(true)
  })
  it('acepta un WITH (CTE) de lectura', () => {
    expect(validarSelect('WITH x AS (SELECT 1) SELECT * FROM x').ok).toBe(true)
  })
  it('acepta punto y coma final y comentarios', () => {
    expect(validarSelect('-- hola\nSELECT 1;').ok).toBe(true)
  })
  it('rechaza UPDATE', () => {
    expect(validarSelect("UPDATE ventas SET monto = 0").ok).toBe(false)
  })
  it('rechaza DELETE/DROP/INSERT/TRUNCATE/ALTER', () => {
    for (const sql of ['DELETE FROM x', 'DROP TABLE x', "INSERT INTO x VALUES (1)", 'TRUNCATE x', 'ALTER TABLE x ADD y int']) {
      expect(validarSelect(sql).ok).toBe(false)
    }
  })
  it('rechaza multiples sentencias', () => {
    expect(validarSelect('SELECT 1; SELECT 2').ok).toBe(false)
  })
  it('rechaza CTE con delete escondido', () => {
    expect(validarSelect('WITH x AS (DELETE FROM ventas RETURNING *) SELECT * FROM x').ok).toBe(false)
  })
  it('no confunde offset con set', () => {
    expect(validarSelect('SELECT * FROM ventas LIMIT 10 OFFSET 5').ok).toBe(true)
  })
})

describe('serializarFilas', () => {
  it('serializa Date y BigInt sin explotar', () => {
    const out = serializarFilas([{ f: new Date('2026-01-01T00:00:00Z'), n: BigInt(9007199254740993) }])
    expect(out).toContain('2026-01-01')
    expect(out).toContain('9007199254740993')
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run __tests__/celia-sql.test.ts`
Expected: FAIL (módulo `@/lib/celia/sql` no existe)

- [ ] **Step 3: Implementar `lib/celia/sql.ts`**

```typescript
import type { Pool } from 'pg'

const MAX_FILAS = 500
const TIMEOUT_MS = 15000

// Palabras que nunca pueden aparecer en una consulta de Celia (defensa en
// profundidad; ademas la sesion corre con default_transaction_read_only)
const PROHIBIDAS = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|vacuum|call|execute|listen|notify|reset|comment|merge|lock)\b/i

export function validarSelect(sql: string): { ok: true } | { ok: false; error: string } {
  const limpio = sql
    .replace(/--.*$/gm, '')          // comentarios de linea
    .replace(/\/\*[\s\S]*?\*\//g, '') // comentarios de bloque
    .trim()
    .replace(/;+\s*$/, '')            // ; final permitido
  if (limpio.length === 0) return { ok: false, error: 'Consulta vacía' }
  if (limpio.includes(';')) return { ok: false, error: 'Solo se permite una única sentencia' }
  if (!/^(select|with)\b/i.test(limpio)) return { ok: false, error: 'Solo se permiten consultas SELECT' }
  const m = limpio.match(PROHIBIDAS)
  if (m) return { ok: false, error: `Operación no permitida: ${m[0].toUpperCase()}. Solo lectura.` }
  return { ok: true }
}

export interface ResultadoConsulta {
  filas: Record<string, unknown>[]
  truncado: boolean
}

export async function ejecutarConsulta(pool: Pool, sql: string): Promise<ResultadoConsulta> {
  const val = validarSelect(sql)
  if (!val.ok) throw new Error(val.error)

  const client = await pool.connect()
  try {
    await client.query(`SET statement_timeout = ${TIMEOUT_MS}`)
    await client.query('SET default_transaction_read_only = on')
    const res = await client.query(sql)
    const filas = res.rows.slice(0, MAX_FILAS)
    return { filas, truncado: res.rows.length > MAX_FILAS }
  } finally {
    try {
      await client.query('RESET statement_timeout')
      await client.query('RESET default_transaction_read_only')
    } catch { /* la conexion puede estar rota tras un timeout */ }
    client.release()
  }
}

export function serializarFilas(filas: Record<string, unknown>[]): string {
  return JSON.stringify(filas, (_k, v) => {
    if (typeof v === 'bigint') return v.toString()
    return v
  })
}
```

- [ ] **Step 4: Correr tests y verificar que pasan**

Run: `npx vitest run __tests__/celia-sql.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/celia/sql.ts __tests__/celia-sql.test.ts
git commit -m "feat(celia): validador y ejecutor SQL read-only con guardrails"
```

---

### Task 2: Pool de Supabase + variable de entorno

**Files:**
- Modify: `lib/db-pool.ts` (agregar al final)
- Modify: `.env.local` (NO se commitea)

**Interfaces:**
- Produces: `getSupabasePool(): Pool | null` — mismo patrón singleton que `getPool()` existente en el mismo archivo.

- [ ] **Step 1: Agregar `getSupabasePool` a `lib/db-pool.ts`**

Seguir el patrón exacto de `getPool()` (líneas 1-24 del archivo):

```typescript
// Singleton pool para el Postgres de Supabase (consultas SQL de Celia)
let supabasePool: Pool | null = null

export function getSupabasePool(): Pool | null {
  const url = process.env.SUPABASE_DB_URL
  if (!url) return null

  if (!supabasePool) {
    supabasePool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false },
    })
    supabasePool.on('error', (err) => {
      console.error('Supabase pool error:', err.message)
    })
  }
  return supabasePool
}
```

- [ ] **Step 2: Agregar `SUPABASE_DB_URL` a `.env.local`**

Obtener la connection string desde Supabase Dashboard → proyecto `rnjxmmcsxmyaktseegvt` → Connect → **Session pooler** (URI). Usar la password conocida de la DB. Formato aproximado:

```
SUPABASE_DB_URL="postgresql://postgres.rnjxmmcsxmyaktseegvt:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

⚠️ Ojo con el formato del `.env.local` de este repo: los valores están entre comillas y algunos traen `\n` literal antes de la comilla de cierre — escribir este SIN `\n`.

- [ ] **Step 3: Verificar conexión con script descartable**

```bash
npx tsx -e "
import { getSupabasePool } from './lib/db-pool';
const p = getSupabasePool();
if (!p) throw new Error('SUPABASE_DB_URL no seteada');
p.query('SELECT count(*) FROM cheques_proveedor').then(r => { console.log('OK cheques:', r.rows[0]); process.exit(0); });
"
```

Expected: imprime el count de cheques (miles de filas). Si `tsx` no está, usar `node --env-file=.env.local` con un script `.mjs` equivalente usando `pg` directo.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit
git add lib/db-pool.ts
git commit -m "feat(celia): pool read-only al Postgres de Supabase"
```

---

### Task 3: Migración de historial en Supabase

**Files:**
- Create: `supabase/migrations/20260813_celia_chat.sql`

**Interfaces:**
- Produces: tablas `celia_conversaciones` y `celia_mensajes` (las consumen Task 5 y Task 6).

- [ ] **Step 1: Escribir la migración**

```sql
-- Celia: historial de conversaciones del asistente AI
create table if not exists celia_conversaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Nueva conversación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists celia_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references celia_conversaciones(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- content guarda los bloques completos del SDK (text/tool_use/tool_result)
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_celia_mensajes_conv on celia_mensajes(conversacion_id, created_at);

-- Sin politicas RLS permisivas: solo se accede con service role desde el server
alter table celia_conversaciones enable row level security;
alter table celia_mensajes enable row level security;
```

- [ ] **Step 2: Aplicar en Supabase**

Ejecutar el SQL en Supabase SQL Editor (proyecto `rnjxmmcsxmyaktseegvt`). **Nombrar la query "Celia — tablas de chat"** (regla del proyecto: siempre nombrar las queries del SQL Editor).

- [ ] **Step 3: Verificar**

En SQL Editor: `select * from celia_conversaciones limit 1;` → 0 filas sin error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260813_celia_chat.sql
git commit -m "feat(celia): migracion de tablas de historial de chat"
```

---

### Task 4: Manual de esquema (system prompt de Celia)

**Files:**
- Create: `lib/celia/contexto.ts`
- Create (descartable, no commitear): `scripts/celia-dump-schema.mjs`

**Interfaces:**
- Produces: `SYSTEM_CELIA: string` (constante exportada, estable — sin fechas ni valores dinámicos para no romper el prompt caching).

- [ ] **Step 1: Dumpear los esquemas reales de ambas DBs**

Crear `scripts/celia-dump-schema.mjs`:

```javascript
import pg from 'pg'
import { readFileSync } from 'fs'

// Cargar .env.local a mano (los valores vienen con comillas y \n literal)
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)="?(.*?)(\\n)?"?$/)
  if (m) process.env[m[1]] = m[2]
}

const QUERY = `
  select table_name, column_name, data_type
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position`

for (const [nombre, url] of [['GOCELULAR', process.env.GOCELULAR_DB_URL], ['SUPABASE', process.env.SUPABASE_DB_URL]]) {
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  const res = await pool.query(QUERY)
  console.log(`\n===== ${nombre} =====`)
  let tabla = ''
  for (const r of res.rows) {
    if (r.table_name !== tabla) { tabla = r.table_name; console.log(`\n## ${tabla}`) }
    console.log(`  ${r.column_name}: ${r.data_type}`)
  }
  await pool.end()
}
```

Run: `node scripts/celia-dump-schema.mjs > /tmp/celia-schemas.txt && wc -l /tmp/celia-schemas.txt`
Expected: listado de tablas/columnas de ambas bases.

- [ ] **Step 2: Escribir `lib/celia/contexto.ts`**

Estructura (el bloque de esquemas se pega desde `/tmp/celia-schemas.txt`, compactado: una línea por tabla con sus columnas; omitir tablas obviamente irrelevantes como internas de auth/storage de Supabase):

```typescript
// System prompt de Celia. IMPORTANTE: mantener ESTABLE (sin fechas, sin
// valores dinamicos) — se cachea con prompt caching y cualquier byte
// distinto invalida el cache.

export const SYSTEM_CELIA = `Sos Celia, la asistente de datos de GOcelular360. Respondés preguntas de Emiliano (el admin) consultando las bases de datos con SQL. Respondé siempre en español rioplatense, con montos formateados estilo argentino ($1.234.567,89).

# Herramientas
- consultar_gocelular: Postgres EXTERNO de GOcelular (ventas, órdenes, inventario, productos de la tienda).
- consultar_supabase: Postgres de la plataforma (echeqs, finanzas, compras, consignatarios, liquidaciones, garantías).

# Reglas de negocio (crítico — aplicalas siempre)
- Ventas/finanzas propias de GOcelular: filtrar client_id IN ('1','2026134','2461631','5495277').
- Ventas válidas: desde '2026-03-23', órdenes entregadas y no descartadas.
- total_order_amount: si un valor es > 5.000.000, está en centavos → dividir por 100.
- Comisiones: se calculan sobre el neto (precio / 1.21, sin IVA).
- Cheques a proveedores: tabla cheques_proveedor en Supabase (sincronizada cada hora desde un sheet). Columnas: numero_cheque, estado_cheque, cuit, nombre, fecha_pago (date), importe (numeric). "Pendiente de pago" = fecha_pago > CURRENT_DATE.
- Canales de venta: la columna de canal está en las órdenes de la tienda; "Riiing" es un canal/vendedor.

# Cómo trabajar
- Armá consultas concretas con agregaciones en SQL (no pidas tablas enteras). Usá LIMIT.
- Si una consulta falla, leé el error y corregila.
- Si no estás segura de una columna, consultá primero information_schema o una fila de muestra.
- En la respuesta final: primero el número/dato pedido, después el detalle. Aclarar de qué tabla salió. Usá tablas markdown cuando ayuden.
- Si el resultado vino truncado (más de 500 filas), decilo y ofrecé agregarlo.

# Esquema GOcelular (externa)
<pegar aquí el dump compactado>

# Esquema Supabase (plataforma)
<pegar aquí el dump compactado>
`
```

⚠️ Los placeholders `<pegar aquí...>` DEBEN quedar reemplazados por el esquema real en este mismo paso — el archivo no se commitea con placeholders.

- [ ] **Step 3: Verificar tamaño razonable**

Run: `npx tsx -e "import { SYSTEM_CELIA } from './lib/celia/contexto'; console.log(SYSTEM_CELIA.length)"`
Expected: entre ~5.000 y ~60.000 caracteres. Si supera 100.000, compactar más el esquema (solo tablas relevantes).

- [ ] **Step 4: Commit (sin el script descartable)**

```bash
npx tsc --noEmit
git add lib/celia/contexto.ts
git commit -m "feat(celia): system prompt con esquemas y reglas de negocio"
rm scripts/celia-dump-schema.mjs
```

---

### Task 5: Server actions de historial

**Files:**
- Create: `lib/actions/celia.ts`

**Interfaces:**
- Produces:
  - `listarConversaciones(): Promise<{ id: string; titulo: string; updated_at: string }[]>`
  - `crearConversacion(primeraPregunta: string): Promise<string>` (devuelve id)
  - `obtenerMensajes(conversacionId: string): Promise<{ id: string; role: 'user' | 'assistant'; content: unknown; created_at: string }[]>`
  - `borrarConversacion(conversacionId: string): Promise<void>`

- [ ] **Step 1: Implementar `lib/actions/celia.ts`**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function exigirAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.rol !== 'admin') throw new Error('No autorizado')
}

export async function listarConversaciones() {
  await exigirAdmin()
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('celia_conversaciones')
    .select('id, titulo, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return data
}

export async function crearConversacion(primeraPregunta: string) {
  await exigirAdmin()
  const sb = createAdminClient()
  const titulo = primeraPregunta.trim().slice(0, 60) || 'Nueva conversación'
  const { data, error } = await sb
    .from('celia_conversaciones')
    .insert({ titulo })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function obtenerMensajes(conversacionId: string) {
  await exigirAdmin()
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('celia_mensajes')
    .select('id, role, content, created_at')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data as { id: string; role: 'user' | 'assistant'; content: unknown; created_at: string }[]
}

export async function borrarConversacion(conversacionId: string) {
  await exigirAdmin()
  const sb = createAdminClient()
  const { error } = await sb.from('celia_conversaciones').delete().eq('id', conversacionId)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/celia.ts
git commit -m "feat(celia): server actions de historial de conversaciones"
```

---

### Task 6: API route del agente (`/api/celia/chat`)

**Files:**
- Create: `app/api/celia/chat/route.ts`

**Interfaces:**
- Consumes: `ejecutarConsulta`, `serializarFilas` (Task 1); `getPool` (existente), `getSupabasePool` (Task 2); `SYSTEM_CELIA` (Task 4); tablas de Task 3.
- Produces: `POST /api/celia/chat` body `{ conversacionId: string, mensaje: string }` → stream SSE con eventos JSON por línea `data: {...}\n\n` de tipos:
  - `{ tipo: 'texto', delta: string }` — texto incremental de la respuesta
  - `{ tipo: 'estado', texto: string }` — ej. "Consultando GOcelular..."
  - `{ tipo: 'fin' }`
  - `{ tipo: 'error', mensaje: string }`

- [ ] **Step 1: Implementar el route handler**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool, getSupabasePool } from '@/lib/db-pool'
import { ejecutarConsulta, serializarFilas } from '@/lib/celia/sql'
import { SYSTEM_CELIA } from '@/lib/celia/contexto'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_ITERACIONES = 15

const tools: Anthropic.Tool[] = [
  {
    name: 'consultar_gocelular',
    description:
      'Ejecuta una consulta SELECT en el Postgres EXTERNO de GOcelular (ventas, órdenes gocuotas_orders/store_orders, inventario inventory_items, modelos device_models, productos store_products). Solo lectura, máx 500 filas.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Una única sentencia SELECT (Postgres)' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'consultar_supabase',
    description:
      'Ejecuta una consulta SELECT en el Postgres de la plataforma GOcelular360 (cheques_proveedor, flujo_*, facturas, proveedores, liquidaciones, garantías, etc.). Solo lectura, máx 500 filas.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Una única sentencia SELECT (Postgres)' },
      },
      required: ['sql'],
    },
  },
]

async function ejecutarTool(nombre: string, sql: string): Promise<{ contenido: string; esError: boolean }> {
  const pool = nombre === 'consultar_gocelular' ? getPool() : getSupabasePool()
  if (!pool) return { contenido: 'Error: base de datos no configurada', esError: true }
  try {
    const { filas, truncado } = await ejecutarConsulta(pool, sql)
    const cuerpo = serializarFilas(filas)
    return {
      contenido: truncado ? `${cuerpo}\n[RESULTADO TRUNCADO a 500 filas]` : cuerpo,
      esError: false,
    }
  } catch (e) {
    return { contenido: `Error SQL: ${e instanceof Error ? e.message : String(e)}`, esError: true }
  }
}

export async function POST(request: Request) {
  // Auth: solo admin
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.rol !== 'admin') {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
  }

  const { conversacionId, mensaje } = await request.json()
  if (!conversacionId || !mensaje?.trim()) {
    return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 })
  }

  const admin = createAdminClient()

  // Cargar historial previo (bloques completos, incluidos tool_use/tool_result)
  const { data: previos } = await admin
    .from('celia_mensajes')
    .select('role, content')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: true })

  const messages: Anthropic.MessageParam[] = [
    ...(previos ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as Anthropic.MessageParam['content'],
    })),
    { role: 'user', content: mensaje },
  ]

  // Persistir el mensaje del usuario ya mismo
  await admin.from('celia_mensajes').insert({
    conversacion_id: conversacionId,
    role: 'user',
    content: [{ type: 'text', text: mensaje }],
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emitir = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        for (let i = 0; i < MAX_ITERACIONES; i++) {
          const msgStream = anthropic.messages.stream({
            model: 'claude-opus-5',
            max_tokens: 16000,
            system: [{ type: 'text', text: SYSTEM_CELIA, cache_control: { type: 'ephemeral' } }],
            tools,
            messages,
          })

          msgStream.on('text', (delta) => emitir({ tipo: 'texto', delta }))

          const respuesta = await msgStream.finalMessage()

          messages.push({ role: 'assistant', content: respuesta.content })
          await admin.from('celia_mensajes').insert({
            conversacion_id: conversacionId,
            role: 'assistant',
            content: respuesta.content,
          })

          if (respuesta.stop_reason === 'tool_use') {
            const resultados: Anthropic.ToolResultBlockParam[] = []
            for (const block of respuesta.content) {
              if (block.type !== 'tool_use') continue
              const base = block.name === 'consultar_gocelular' ? 'GOcelular' : 'la plataforma'
              emitir({ tipo: 'estado', texto: `Consultando ${base}...` })
              const input = block.input as { sql: string }
              const { contenido, esError } = await ejecutarTool(block.name, input.sql)
              resultados.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: contenido,
                is_error: esError,
              })
            }
            const turnoResultados: Anthropic.MessageParam = { role: 'user', content: resultados }
            messages.push(turnoResultados)
            await admin.from('celia_mensajes').insert({
              conversacion_id: conversacionId,
              role: 'user',
              content: resultados,
            })
            continue
          }

          if (respuesta.stop_reason === 'refusal') {
            emitir({ tipo: 'error', mensaje: 'Celia no pudo responder esa consulta. Probá reformularla.' })
          } else if (respuesta.stop_reason === 'max_tokens') {
            emitir({ tipo: 'error', mensaje: 'La respuesta quedó incompleta (límite de tokens). Pedile que resuma.' })
          }
          break // end_turn u otro stop: terminamos
        }

        await admin
          .from('celia_conversaciones')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversacionId)

        emitir({ tipo: 'fin' })
      } catch (e) {
        console.error('Celia error:', e)
        emitir({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'Error inesperado' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

Nota: si el loop llega a `MAX_ITERACIONES` sin `end_turn`, el `for` termina solo y se emite `fin` — la respuesta parcial ya fue streameada.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpio. (Si `cache_control` da error de tipos en esta versión del SDK, tipar el bloque system como `Anthropic.TextBlockParam[]`.)

- [ ] **Step 3: Prueba manual con curl (con dev server corriendo)**

```bash
# En una terminal: npm run dev
# Crear una conversación de prueba directo en Supabase SQL Editor:
#   insert into celia_conversaciones (titulo) values ('test') returning id;
# Como la ruta exige sesión admin, la prueba completa se hace en Task 8 desde el navegador.
# Acá solo verificar que sin auth devuelve 401:
curl -s -X POST http://localhost:3000/api/celia/chat -H 'Content-Type: application/json' -d '{"conversacionId":"x","mensaje":"hola"}'
```

Expected: `{"error":"No autorizado"}` (status 401).

- [ ] **Step 4: Commit**

```bash
git add app/api/celia/chat/route.ts
git commit -m "feat(celia): route handler del agente con loop de tools y SSE"
```

---

### Task 7: UI de la página Celia

**Files:**
- Create: `app/(admin)/celia/page.tsx`
- Create: `app/(admin)/celia/CeliaClient.tsx`

**Interfaces:**
- Consumes: server actions de Task 5; endpoint SSE de Task 6 (eventos `texto`/`estado`/`fin`/`error`).

- [ ] **Step 1: Instalar dependencias de markdown**

```bash
npm install react-markdown remark-gfm
```

- [ ] **Step 2: Crear `app/(admin)/celia/page.tsx`** (server component)

```typescript
import { listarConversaciones } from '@/lib/actions/celia'
import CeliaClient from './CeliaClient'

export const dynamic = 'force-dynamic'

export default async function CeliaPage() {
  const conversaciones = await listarConversaciones()
  return <CeliaClient conversacionesIniciales={conversaciones} />
}
```

- [ ] **Step 3: Crear `app/(admin)/celia/CeliaClient.tsx`** (client component)

Requisitos concretos (implementar completo, estilo Finanzas — tablas compactas, `bg-gray-900` para botones primarios):

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { crearConversacion, obtenerMensajes, borrarConversacion } from '@/lib/actions/celia'

interface Conversacion { id: string; titulo: string; updated_at: string }
interface MensajeUI { role: 'user' | 'assistant'; texto: string }

// Extrae solo los bloques de texto de un content jsonb guardado
function textoDeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('')
}

export default function CeliaClient({ conversacionesIniciales }: { conversacionesIniciales: Conversacion[] }) {
  const [conversaciones, setConversaciones] = useState(conversacionesIniciales)
  const [activaId, setActivaId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<MensajeUI[]>([])
  const [input, setInput] = useState('')
  const [pensando, setPensando] = useState(false)
  const [estado, setEstado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, estado])

  async function abrirConversacion(id: string) {
    setActivaId(id)
    setError(null)
    const rows = await obtenerMensajes(id)
    // Solo user con texto plano y assistant con bloques de texto no vacios
    const ui: MensajeUI[] = []
    for (const r of rows) {
      const texto = textoDeContent(r.content)
      if (texto.trim()) ui.push({ role: r.role, texto })
    }
    setMensajes(ui)
  }

  async function enviar() {
    const pregunta = input.trim()
    if (!pregunta || pensando) return
    setInput('')
    setError(null)
    setPensando(true)

    let convId = activaId
    if (!convId) {
      convId = await crearConversacion(pregunta)
      setActivaId(convId)
      setConversaciones((prev) => [
        { id: convId!, titulo: pregunta.slice(0, 60), updated_at: new Date().toISOString() },
        ...prev,
      ])
    }

    setMensajes((prev) => [...prev, { role: 'user', texto: pregunta }, { role: 'assistant', texto: '' }])

    try {
      const res = await fetch('/api/celia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacionId: convId, mensaje: pregunta }),
      })
      if (!res.ok || !res.body) throw new Error(`Error ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const partes = buffer.split('\n\n')
        buffer = partes.pop() ?? ''
        for (const parte of partes) {
          if (!parte.startsWith('data: ')) continue
          const ev = JSON.parse(parte.slice(6))
          if (ev.tipo === 'texto') {
            setEstado(null)
            setMensajes((prev) => {
              const copia = [...prev]
              const ultimo = copia[copia.length - 1]
              copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + ev.delta }
              return copia
            })
          } else if (ev.tipo === 'estado') {
            setEstado(ev.texto)
            // Nueva burbuja de assistant para el texto que viene despues de la consulta
            setMensajes((prev) => {
              const ultimo = prev[prev.length - 1]
              return ultimo.role === 'assistant' && ultimo.texto === ''
                ? prev
                : [...prev, { role: 'assistant', texto: '' }]
            })
          } else if (ev.tipo === 'error') {
            setError(ev.mensaje)
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión')
    } finally {
      setPensando(false)
      setEstado(null)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar esta conversación?')) return
    await borrarConversacion(id)
    setConversaciones((prev) => prev.filter((c) => c.id !== id))
    if (activaId === id) { setActivaId(null); setMensajes([]) }
  }

  function nueva() {
    setActivaId(null)
    setMensajes([])
    setError(null)
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4">
      {/* Historial */}
      <aside className="w-64 shrink-0 bg-white border border-gray-200 rounded-xl flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <button onClick={nueva} className="w-full bg-gray-900 text-white text-sm rounded-lg py-2 hover:bg-gray-700">
            + Nueva conversación
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversaciones.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center justify-between px-3 py-2 text-sm rounded-lg cursor-pointer ${
                activaId === c.id ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              }`}
              onClick={() => abrirConversacion(c.id)}
            >
              <span className="truncate">{c.titulo}</span>
              <button
                onClick={(e) => { e.stopPropagation(); borrar(c.id) }}
                className="hidden group-hover:block text-gray-400 hover:text-red-600 text-xs ml-2"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <section className="flex-1 bg-white border border-gray-200 rounded-xl flex flex-col min-w-0">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold">Celia</h1>
          <p className="text-xs text-gray-400">Asistente de datos de GOcelular360</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mensajes.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-12">
              Preguntame lo que quieras sobre ventas, echeqs, inventario, finanzas...
            </p>
          )}
          {mensajes.map((m, i) =>
            m.texto || m.role === 'user' ? (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'bg-gray-900 text-white rounded-2xl rounded-br-sm px-4 py-2 max-w-[75%] text-sm'
                      : 'bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] text-sm prose prose-sm max-w-none [&_table]:text-xs'
                  }
                >
                  {m.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.texto}</ReactMarkdown>
                  ) : (
                    m.texto
                  )}
                </div>
              </div>
            ) : null
          )}
          {estado && <p className="text-xs text-gray-400 italic animate-pulse">{estado}</p>}
          {pensando && !estado && mensajes[mensajes.length - 1]?.texto === '' && (
            <p className="text-xs text-gray-400 italic animate-pulse">Pensando...</p>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div ref={finRef} />
        </div>
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar()}
            placeholder="Ej: ¿cuántos celulares vendió Riiing hoy?"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            disabled={pensando}
          />
          <button
            onClick={enviar}
            disabled={pensando || !input.trim()}
            className="bg-gray-900 text-white text-sm rounded-lg px-5 py-2 hover:bg-gray-700 disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </section>
    </div>
  )
}
```

Nota: si el proyecto no tiene el plugin `@tailwindcss/typography` (clases `prose`), quitar `prose prose-sm` y agregar estilos mínimos: `[&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:bg-gray-100 [&_p]:my-1`.

- [ ] **Step 4: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/celia/ package.json package-lock.json
git commit -m "feat(celia): pagina de chat con historial y streaming"
```

---

### Task 8: Entrada en el sidebar con icono de Celia

**Files:**
- Modify: `components/NavIcon.tsx` (agregar icono `celia` al union `IconName` y su SVG)
- Modify: `app/(admin)/layout.tsx:16-34` (agregar item al array `navItems`)

- [ ] **Step 1: Agregar el icono en `NavIcon.tsx`**

Agregar `'celia'` al type `IconName` y este SVG al mapa de iconos (asistente mujer con vincha/auricular, trazo consistente con los demás iconos del archivo — revisar el patrón existente y adaptar stroke/fill):

```tsx
celia: (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* cabeza con pelo */}
    <path d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 1.2.3 2.1.8 2.9-.5.9-.8 1.9-.8 2.6h11c0-.7-.3-1.7-.8-2.6.5-.8.8-1.7.8-2.9A5.5 5.5 0 0 0 12 3Z" />
    {/* cara */}
    <circle cx="12" cy="9.5" r="2.8" />
    {/* auricular/vincha */}
    <path d="M6.5 9.5H5a1 1 0 0 0-1 1v1.5a1 1 0 0 0 1 1h1.5" />
    <path d="M17.5 9.5H19a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1h-1.5" />
    <path d="M17.5 13v1.5a2 2 0 0 1-2 2H13" />
    {/* hombros */}
    <path d="M5 21c0-2.8 3.1-4.5 7-4.5s7 1.7 7 4.5" />
  </svg>
),
```

- [ ] **Step 2: Agregar el item de navegación en `app/(admin)/layout.tsx`**

Insertar después de la línea de Dashboard360 (posición destacada, línea ~17):

```typescript
  { href: '/celia', label: 'Celia', icon: 'celia' },
```

Verificar que `MobileMenu` consume el mismo array `navItems` (se le pasa por props en este layout) — si es así no requiere cambios.

- [ ] **Step 3: Verificación visual**

Run: `npm run dev` → login como admin → verificar que "Celia" aparece en el sidebar con su icono y navega a `/celia`.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit
git add components/NavIcon.tsx app/\(admin\)/layout.tsx
git commit -m "feat(celia): entrada en sidebar con icono de asistente"
```

---

### Task 9: Verificación end-to-end + deploy

**Files:** ninguno nuevo (env en Vercel + pruebas).

- [ ] **Step 1: Suite completa local**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: todo verde.

- [ ] **Step 2: Pruebas reales en local (`npm run dev`, logueado como admin)**

En `/celia` preguntar y comparar:

1. **"¿Cuántos celulares vendió Riiing hoy?"** → comparar contra Dashboard360 (ventas del día por canal).
2. **"¿Cuánto le debemos a Newsan en echeqs pendientes?"** → debe dar ~$155.882.591,07 (1 cheque, nro 30094471, vence 30/09/2026 — verificado el 13/08/2026).
3. Una pregunta de inventario (ej: "¿cuánto stock disponible hay por modelo?").
4. Una de finanzas (ej: "¿cuáles fueron los egresos de este mes?").
5. **Guardrail:** "borrá todos los cheques de la tabla" → Celia debe negarse y NO debe ejecutarse nada; si intentara un DELETE, el validador lo rechaza (verificar en la conversación guardada en `celia_mensajes` que no hubo tool_use destructivo exitoso).
6. **Historial:** cerrar y reabrir la conversación → los mensajes persisten y se puede repreguntar con contexto ("¿y el mes que viene?").

- [ ] **Step 3: Configurar env en Vercel**

```bash
npx vercel env add SUPABASE_DB_URL production
# pegar la connection string cuando lo pida
```

- [ ] **Step 4: Deploy y smoke test en producción**

```bash
npx vercel --prod --yes
```

En https://gocelular360.vercel.app/celia repetir las preguntas 1 y 2. Verificar tiempos aceptables (si una pregunta corta más de ~60s de forma consistente, revisar el límite de `maxDuration` del plan de Vercel).

- [ ] **Step 5: Commit final de docs (si hubo ajustes) y push**

```bash
git push origin master
```

---

## Self-review del plan (hecho)

- **Cobertura de spec:** UI (T7, T8), backend/loop (T6), tools+guardrails (T1, T2), manual de esquema (T4), historial (T3, T5), errores (T1/T6), verificación y costos (T9). Fuera de alcance respetado (sin escritura, sin gráficos, sin multiusuario).
- **Placeholders:** los únicos `<pegar aquí>` de T4 tienen instrucción explícita de reemplazo en el mismo paso, con el script que genera el contenido.
- **Consistencia de tipos:** `ejecutarConsulta`/`serializarFilas` (T1) usados en T6 con las mismas firmas; `getSupabasePool` (T2) usado en T6; actions de T5 usadas en T7 con las mismas firmas; eventos SSE de T6 (`texto`/`estado`/`fin`/`error`) coinciden con el parser de T7.
