# CRM KEYcontact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CRM report page at `/terceros/crm` connected to KEYcontact's database, showing the GOcelulares pipeline with 3 tabs: Pipeline (deals table + stage summary), Conversión (funnel + rates + time metrics), and Reuniones (meetings table).

**Architecture:** New `lib/keycontact.ts` pool helper + `lib/actions/crm-keycontact.ts` server actions querying KEYcontact Postgres. Page uses `FinanzasTabs` for tab layout. Each tab is a client component with its own time filter (presets + custom range). Data fetched server-side and passed as props.

**Tech Stack:** Next.js 14 server components, pg Pool, FinanzasTabs client component, Tailwind CSS, existing UI patterns from the app.

---

### Task 1: Environment + Pool Helper

**Files:**
- Modify: `.env.local` (add KEYCONTACT_DB_URL)
- Modify: `lib/db-pool.ts` (add getKeyContactPool)

- [ ] **Step 1: Add env var to .env.local**

Add this line to `.env.local`:
```
KEYCONTACT_DB_URL="postgresql://postgres.piiovisvcuyzxmarshxk:mOwVClljWNazVT69@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"
```

- [ ] **Step 2: Add getKeyContactPool to lib/db-pool.ts**

Add at the bottom of `lib/db-pool.ts`:

```typescript
// Singleton pool para KEYcontact CRM DB
let keyContactPool: Pool | null = null

export function getKeyContactPool(): Pool | null {
  const url = process.env.KEYCONTACT_DB_URL
  if (!url) return null

  if (!keyContactPool) {
    keyContactPool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
    keyContactPool.on('error', (err) => {
      console.error('KEYcontact pool error:', err.message)
    })
  }
  return keyContactPool
}
```

- [ ] **Step 3: Verify connection works**

Run:
```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.piiovisvcuyzxmarshxk:mOwVClljWNazVT69@aws-1-sa-east-1.pooler.supabase.com:6543/postgres', ssl: { rejectUnauthorized: false } });
(async () => { const c = await pool.connect(); const r = await c.query('SELECT 1 AS ok'); console.log(r.rows); c.release(); pool.end(); })();
"
```
Expected: `[ { ok: 1 } ]`

- [ ] **Step 4: Commit**

```bash
git add lib/db-pool.ts
git commit -m "feat: add KEYcontact DB pool helper"
```

Note: Do NOT commit `.env.local`.

---

### Task 2: Server Actions — Pipeline Data

**Files:**
- Create: `lib/actions/crm-keycontact.ts`

- [ ] **Step 1: Create the server actions file with types and constants**

Create `lib/actions/crm-keycontact.ts`:

```typescript
'use server'

import { getKeyContactPool } from '@/lib/db-pool'

const PIPELINE_ID = '6d86ed8c-704b-41f9-adf6-772bb0fe0729'

export type Stage = {
  id: string
  name: string
  slug: string
  order_position: number
  is_closed: boolean
  is_won: boolean
}

export type Deal = {
  id: string
  name: string
  city: string | null
  province: string | null
  locations_count: number
  lead_score: number | null
  updated_at: string
  stage_name: string
  stage_slug: string
  order_position: number
  owner_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
}

export type StageSummary = Stage & {
  deals_count: number
  entradas: number
  salidas: number
}

export type Owner = {
  id: string
  full_name: string
}

export type PipelineData = {
  stages: StageSummary[]
  deals: Deal[]
  owners: Owner[]
}
```

- [ ] **Step 2: Add fetchPipelineData function**

Append to `lib/actions/crm-keycontact.ts`:

```typescript
export async function fetchPipelineData(desde: string, hasta: string, stageSlug?: string, ownerId?: string): Promise<PipelineData> {
  const pool = getKeyContactPool()
  if (!pool) return { stages: [], deals: [], owners: [] }

  const client = await pool.connect()
  try {
    // 1. Stages
    const stagesRes = await client.query<Stage>(
      `SELECT id, name, slug, order_position, is_closed, is_won
       FROM pipeline_stages
       WHERE pipeline_id = $1 AND is_active = true
       ORDER BY order_position`,
      [PIPELINE_ID]
    )

    // 2. Current deal counts per stage
    const countsRes = await client.query<{ stage_id: string; cnt: string }>(
      `SELECT stage_id, COUNT(*)::text AS cnt
       FROM deals WHERE pipeline_id = $1
       GROUP BY stage_id`,
      [PIPELINE_ID]
    )
    const countMap = new Map(countsRes.rows.map(r => [r.stage_id, parseInt(r.cnt)]))

    // 3. Entradas per stage in period
    const entradasRes = await client.query<{ to_stage_id: string; cnt: string }>(
      `SELECT to_stage_id, COUNT(*)::text AS cnt
       FROM stage_history
       WHERE to_stage_id IN (SELECT id FROM pipeline_stages WHERE pipeline_id = $1)
         AND created_at >= $2::date AND created_at < ($3::date + 1)
       GROUP BY to_stage_id`,
      [PIPELINE_ID, desde, hasta]
    )
    const entradasMap = new Map(entradasRes.rows.map(r => [r.to_stage_id, parseInt(r.cnt)]))

    // 4. Salidas per stage in period
    const salidasRes = await client.query<{ from_stage_id: string; cnt: string }>(
      `SELECT from_stage_id, COUNT(*)::text AS cnt
       FROM stage_history
       WHERE from_stage_id IN (SELECT id FROM pipeline_stages WHERE pipeline_id = $1)
         AND from_stage_id IS NOT NULL
         AND created_at >= $2::date AND created_at < ($3::date + 1)
       GROUP BY from_stage_id`,
      [PIPELINE_ID, desde, hasta]
    )
    const salidasMap = new Map(salidasRes.rows.map(r => [r.from_stage_id, parseInt(r.cnt)]))

    const stages: StageSummary[] = stagesRes.rows.map(s => ({
      ...s,
      deals_count: countMap.get(s.id) ?? 0,
      entradas: entradasMap.get(s.id) ?? 0,
      salidas: salidasMap.get(s.id) ?? 0,
    }))

    // 5. Deals
    let dealsQuery = `
      SELECT d.id, d.name, d.city, d.province, d.locations_count, d.lead_score,
             d.updated_at::text,
             ps.name AS stage_name, ps.slug AS stage_slug, ps.order_position,
             u.full_name AS owner_name,
             c.full_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone
      FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.stage_id
      JOIN users u ON u.id = d.owner_id
      LEFT JOIN deal_contacts dc ON dc.deal_id = d.id AND dc.is_primary
      LEFT JOIN contacts c ON c.id = dc.contact_id AND c.deleted_at IS NULL
      WHERE d.pipeline_id = $1
        AND d.created_at >= $2::date AND d.created_at < ($3::date + 1)`
    const params: (string)[] = [PIPELINE_ID, desde, hasta]

    if (stageSlug && stageSlug !== '') {
      params.push(stageSlug)
      dealsQuery += ` AND ps.slug = $${params.length}`
    }
    if (ownerId && ownerId !== '') {
      params.push(ownerId)
      dealsQuery += ` AND d.owner_id = $${params.length}::uuid`
    }
    dealsQuery += ` ORDER BY d.created_at DESC`

    const dealsRes = await client.query<Deal>(dealsQuery, params)

    // 6. Owners for filter dropdown
    const ownersRes = await client.query<Owner>(
      `SELECT DISTINCT u.id, u.full_name
       FROM deals d JOIN users u ON u.id = d.owner_id
       WHERE d.pipeline_id = $1
       ORDER BY u.full_name`,
      [PIPELINE_ID]
    )

    return { stages, deals: dealsRes.rows, owners: ownersRes.rows }
  } finally {
    client.release()
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lib/actions/crm-keycontact.ts
git commit -m "feat: add fetchPipelineData server action for KEYcontact CRM"
```

---

### Task 3: Server Actions — Conversion + Meetings

**Files:**
- Modify: `lib/actions/crm-keycontact.ts`

- [ ] **Step 1: Add conversion types and fetchConversionData**

Append to `lib/actions/crm-keycontact.ts`:

```typescript
export type ConversionData = {
  stages: { id: string; name: string; slug: string; order_position: number; is_won: boolean; deals_count: number }[]
  transitions: { from_name: string; to_name: string; count: number; from_count: number; rate: number }[]
  total_rate: number
  avg_time_per_stage: { stage_name: string; avg_days: number }[]
  avg_total_days: number
}

export async function fetchConversionData(desde: string, hasta: string): Promise<ConversionData> {
  const pool = getKeyContactPool()
  if (!pool) return { stages: [], transitions: [], total_rate: 0, avg_time_per_stage: [], avg_total_days: 0 }

  const client = await pool.connect()
  try {
    // Stages with deal counts (deals that were in each stage during the period)
    const stagesRes = await client.query<{ id: string; name: string; slug: string; order_position: number; is_won: boolean; deals_count: number }>(
      `SELECT ps.id, ps.name, ps.slug, ps.order_position, ps.is_won,
              COUNT(d.id)::int AS deals_count
       FROM pipeline_stages ps
       LEFT JOIN deals d ON d.stage_id = ps.id AND d.pipeline_id = $1
       WHERE ps.pipeline_id = $1 AND ps.is_active = true
       GROUP BY ps.id, ps.name, ps.slug, ps.order_position, ps.is_won
       ORDER BY ps.order_position`,
      [PIPELINE_ID]
    )

    // Transitions in period
    const transRes = await client.query<{ from_slug: string; from_name: string; to_slug: string; to_name: string; cnt: string }>(
      `SELECT pf.slug AS from_slug, pf.name AS from_name, pt.slug AS to_slug, pt.name AS to_name,
              COUNT(*)::text AS cnt
       FROM stage_history sh
       JOIN pipeline_stages pf ON pf.id = sh.from_stage_id
       JOIN pipeline_stages pt ON pt.id = sh.to_stage_id
       WHERE pt.pipeline_id = $1
         AND sh.from_stage_id IS NOT NULL
         AND sh.created_at >= $2::date AND sh.created_at < ($3::date + 1)
       GROUP BY pf.slug, pf.name, pt.slug, pt.name, pf.order_position
       ORDER BY pf.order_position`,
      [PIPELINE_ID, desde, hasta]
    )

    // Entradas per stage to calculate rates
    const entradasRes = await client.query<{ to_stage_id: string; cnt: string }>(
      `SELECT to_stage_id, COUNT(*)::text AS cnt
       FROM stage_history
       WHERE to_stage_id IN (SELECT id FROM pipeline_stages WHERE pipeline_id = $1)
         AND created_at >= $2::date AND created_at < ($3::date + 1)
       GROUP BY to_stage_id`,
      [PIPELINE_ID, desde, hasta]
    )
    const entradasMap = new Map(entradasRes.rows.map(r => [r.to_stage_id, parseInt(r.cnt)]))

    // Build transitions with rates
    const stageBySlug = new Map(stagesRes.rows.map(s => [s.slug, s]))
    const transitions = transRes.rows.map(t => {
      const fromStage = stageBySlug.get(t.from_slug)
      const fromEntradas = fromStage ? (entradasMap.get(fromStage.id) ?? fromStage.deals_count) : 1
      const count = parseInt(t.cnt)
      return {
        from_name: t.from_name,
        to_name: t.to_name,
        count,
        from_count: fromEntradas,
        rate: fromEntradas > 0 ? (count / fromEntradas) * 100 : 0,
      }
    })

    // Total rate: deals that reached Ganado or Parcialmente Ganado / deals that were Prospecto
    const prospectoStage = stagesRes.rows.find(s => s.slug === 'prospecto')
    const ganadoEntradas = stagesRes.rows
      .filter(s => s.is_won || s.slug === 'parcialmente_ganado')
      .reduce((sum, s) => sum + (entradasMap.get(s.id) ?? 0), 0)
    const prospectoEntradas = prospectoStage ? (entradasMap.get(prospectoStage.id) ?? prospectoStage.deals_count) : 1
    const total_rate = prospectoEntradas > 0 ? (ganadoEntradas / prospectoEntradas) * 100 : 0

    // Average time per stage
    const timeRes = await client.query<{ stage_name: string; avg_days: number }>(
      `SELECT ps.name AS stage_name,
              COALESCE(AVG(
                CASE WHEN sh.time_in_previous_stage_days IS NOT NULL
                  THEN sh.time_in_previous_stage_days
                  ELSE EXTRACT(DAY FROM sh.created_at - LAG(sh.created_at) OVER (PARTITION BY sh.deal_id ORDER BY sh.created_at))::int
                END
              ), 0)::int AS avg_days
       FROM stage_history sh
       JOIN pipeline_stages ps ON ps.id = sh.from_stage_id
       WHERE ps.pipeline_id = $1
         AND sh.from_stage_id IS NOT NULL
         AND sh.created_at >= $2::date AND sh.created_at < ($3::date + 1)
       GROUP BY ps.name, ps.order_position
       ORDER BY ps.order_position`,
      [PIPELINE_ID, desde, hasta]
    )

    // Total average days for deals that reached Ganado/Parcialmente Ganado
    const totalTimeRes = await client.query<{ avg_total: number }>(
      `SELECT COALESCE(AVG(total_days), 0)::int AS avg_total
       FROM (
         SELECT sh.deal_id, SUM(COALESCE(sh.time_in_previous_stage_days, 0)) AS total_days
         FROM stage_history sh
         JOIN pipeline_stages ps ON ps.id = sh.to_stage_id
         WHERE ps.pipeline_id = $1 AND (ps.is_won = true OR ps.slug = 'parcialmente_ganado')
           AND sh.created_at >= $2::date AND sh.created_at < ($3::date + 1)
         GROUP BY sh.deal_id
       ) sub`,
      [PIPELINE_ID, desde, hasta]
    )

    return {
      stages: stagesRes.rows,
      transitions,
      total_rate,
      avg_time_per_stage: timeRes.rows,
      avg_total_days: totalTimeRes.rows[0]?.avg_total ?? 0,
    }
  } finally {
    client.release()
  }
}
```

- [ ] **Step 2: Add meeting types and fetchMeetingsData**

Append to `lib/actions/crm-keycontact.ts`:

```typescript
export type Meeting = {
  id: string
  scheduled_date: string
  meeting_type: string | null
  executed_at: string | null
  outcome: string | null
  deal_name: string
}

export type MeetingsData = {
  total: number
  meetings: Meeting[]
}

export async function fetchMeetingsData(desde: string, hasta: string): Promise<MeetingsData> {
  const pool = getKeyContactPool()
  if (!pool) return { total: 0, meetings: [] }

  const client = await pool.connect()
  try {
    const res = await client.query<Meeting>(
      `SELECT m.id, m.scheduled_date::text, m.meeting_type, m.executed_at::text, m.outcome,
              d.name AS deal_name
       FROM meetings m
       JOIN deals d ON d.id = m.deal_id
       WHERE d.pipeline_id = $1
         AND m.scheduled_date >= $2::date AND m.scheduled_date < ($3::date + 1)
       ORDER BY m.scheduled_date DESC`,
      [PIPELINE_ID, desde, hasta]
    )

    return { total: res.rows.length, meetings: res.rows }
  } finally {
    client.release()
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lib/actions/crm-keycontact.ts
git commit -m "feat: add fetchConversionData and fetchMeetingsData server actions"
```

---

### Task 4: Pipeline Tab Component

**Files:**
- Create: `app/(admin)/terceros/crm/PipelineTab.tsx`

- [ ] **Step 1: Create PipelineTab.tsx**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { fetchPipelineData, type PipelineData, type Owner } from '@/lib/actions/crm-keycontact'

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
function quarterStart(): string { const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(1); return d.toISOString().slice(0, 10) }

const PRESETS = [
  { label: 'Semana', desde: () => daysAgo(7), hasta: () => today() },
  { label: 'Mes', desde: () => monthStart(), hasta: () => today() },
  { label: 'Trimestre', desde: () => quarterStart(), hasta: () => today() },
]

const STAGE_COLORS: Record<string, string> = {
  prospecto: 'bg-gray-100 text-gray-700',
  lead: 'bg-blue-100 text-blue-700',
  reunion_propuesta: 'bg-indigo-100 text-indigo-700',
  seguimiento: 'bg-purple-100 text-purple-700',
  parcialmente_ganado: 'bg-amber-100 text-amber-700',
  ganado: 'bg-emerald-100 text-emerald-700',
  perdido: 'bg-red-100 text-red-700',
}

export default function PipelineTab({ data: initialData, owners: initialOwners }: { data: PipelineData; owners: Owner[] }) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<number | null>(1)
  const [stageFilter, setStageFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reload(d: string, h: string, presetIdx: number | null, stage?: string, owner?: string) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    const sf = stage ?? stageFilter
    const of = owner ?? ownerFilter
    startTransition(async () => { setData(await fetchPipelineData(d, h, sf, of)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  function handleStageChange(slug: string) {
    setStageFilter(slug); reload(desde, hasta, activePreset, slug, ownerFilter)
  }

  function handleOwnerChange(id: string) {
    setOwnerFilter(id); reload(desde, hasta, activePreset, stageFilter, id)
  }

  const { stages, deals } = data

  return (
    <div className={`space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p, i) => (
          <button key={i} onClick={() => handlePreset(i)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setActivePreset(null) }}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
        <span className="text-xs text-gray-400">a</span>
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setActivePreset(null) }}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
        <button onClick={() => reload(desde, hasta, null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Aplicar
        </button>
        <span className="text-gray-300 ml-1">|</span>
        <select value={stageFilter} onChange={e => handleStageChange(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
          <option value="">Todas las etapas</option>
          {stages.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
        <select value={ownerFilter} onChange={e => handleOwnerChange(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
          <option value="">Todos los owners</option>
          {initialOwners.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
        </select>
      </div>

      {/* Stage summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {stages.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-700 mb-2 truncate">{s.name}</p>
            <p className="text-2xl font-bold text-gray-900">{s.deals_count}</p>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-emerald-600">+{s.entradas}</span>
              <span className="text-red-500">-{s.salidas}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Deals table */}
      {deals.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Sin deals para este filtro.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Comercio</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Ciudad/Provincia</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Sucursales</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Etapa</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Owner</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Lead Score</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Última actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deals.map(d => (
                <>
                  <tr key={d.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                    <td className="px-5 py-3 font-semibold text-gray-900">{d.name}</td>
                    <td className="px-5 py-3 text-gray-500">{[d.city, d.province].filter(Boolean).join(', ') || '-'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{d.locations_count}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[d.stage_slug] ?? 'bg-gray-100 text-gray-600'}`}>
                        {d.stage_name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{d.owner_name}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{d.lead_score ?? '-'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{d.updated_at ? new Date(d.updated_at).toLocaleDateString('es-AR') : '-'}</td>
                  </tr>
                  {expandedId === d.id && (
                    <tr key={`${d.id}-detail`} className="bg-gray-50">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="flex gap-6 text-xs text-gray-600">
                          <div><span className="font-medium text-gray-700">Contacto:</span> {d.contact_name ?? 'Sin contacto'}</div>
                          {d.contact_email && <div><span className="font-medium text-gray-700">Email:</span> {d.contact_email}</div>}
                          {d.contact_phone && <div><span className="font-medium text-gray-700">Tel:</span> {d.contact_phone}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/terceros/crm/PipelineTab.tsx
git commit -m "feat: add PipelineTab component with stage summary and deals table"
```

---

### Task 5: Conversion Tab Component

**Files:**
- Create: `app/(admin)/terceros/crm/ConversionTab.tsx`

- [ ] **Step 1: Create ConversionTab.tsx**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { fetchConversionData, type ConversionData } from '@/lib/actions/crm-keycontact'

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
function quarterStart(): string { const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(1); return d.toISOString().slice(0, 10) }

const PRESETS = [
  { label: 'Semana', desde: () => daysAgo(7), hasta: () => today() },
  { label: 'Mes', desde: () => monthStart(), hasta: () => today() },
  { label: 'Trimestre', desde: () => quarterStart(), hasta: () => today() },
]

const FUNNEL_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  { bg: 'bg-purple-100', text: 'text-purple-800' },
  { bg: 'bg-amber-100', text: 'text-amber-800' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800' },
]

function fmtPct(n: number): string { return n.toFixed(1) + '%' }

export default function ConversionTab({ data: initialData }: { data: ConversionData }) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<number | null>(1)
  const [isPending, startTransition] = useTransition()

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    startTransition(async () => { setData(await fetchConversionData(d, h)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  const { stages, transitions, total_rate, avg_time_per_stage, avg_total_days } = data
  const openStages = stages.filter(s => s.slug !== 'perdido')
  const maxDeals = Math.max(...openStages.map(s => s.deals_count), 1)

  return (
    <div className={`space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p, i) => (
          <button key={i} onClick={() => handlePreset(i)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setActivePreset(null) }}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
        <span className="text-xs text-gray-400">a</span>
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setActivePreset(null) }}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
        <button onClick={() => reload(desde, hasta, null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Aplicar
        </button>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-6">Funnel de conversión</h2>
        <div className="flex flex-col items-center gap-1">
          {openStages.map((s, i) => {
            const widthPct = Math.max((s.deals_count / maxDeals) * 100, 15)
            const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length]
            const nextStage = openStages[i + 1]
            const transition = nextStage ? transitions.find(t => t.from_name === s.name && t.to_name === nextStage.name) : null
            return (
              <div key={s.id} className="w-full flex flex-col items-center">
                <div className={`${color.bg} ${i === 0 ? 'rounded-t-xl' : ''} ${i === openStages.length - 1 ? 'rounded-b-xl' : ''} h-14 flex items-center justify-center`}
                  style={{ width: `${widthPct}%` }}>
                  <div className="text-center">
                    <span className={`text-lg font-bold ${color.text} font-mono`}>{s.deals_count}</span>
                    <span className={`text-xs ${color.text} ml-2`}>{s.name}</span>
                  </div>
                </div>
                {transition && (
                  <div className="flex items-center gap-1.5 py-0.5">
                    <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    <span className="text-[11px] text-gray-500">{fmtPct(transition.rate)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 text-center">
          <span className="text-xs text-gray-500">Conversión total Prospecto → Ganado: </span>
          <span className="text-sm font-bold text-gray-900">{fmtPct(total_rate)}</span>
        </div>
      </div>

      {/* Conversion rates + Total */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Tasa por etapa</h2>
          {transitions.length === 0 ? (
            <p className="text-sm text-gray-400">Sin transiciones en este período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 text-xs font-medium text-gray-500">Transición</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500">Deals</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500">Tasa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transitions.map((t, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-700">{t.from_name} → {t.to_name}</td>
                    <td className="py-2 text-right text-gray-600">{t.count}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">{fmtPct(t.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-500 mb-2">Conversión total</p>
          <p className="text-4xl font-bold text-gray-900">{fmtPct(total_rate)}</p>
          <p className="text-xs text-gray-400 mt-1">Prospecto → Ganado / Parcialmente Ganado</p>
        </div>
      </div>

      {/* Time metrics */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
        <div className="flex items-baseline gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Tiempo promedio por etapa</h2>
          <span className="text-xs text-gray-400">|</span>
          <span className="text-xs text-gray-500">Total Prospecto → Ganado:</span>
          <span className="text-lg font-bold text-gray-900">{avg_total_days} días</span>
        </div>
        {avg_time_per_stage.length === 0 ? (
          <p className="text-sm text-gray-400">Sin datos de tiempo en este período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 text-xs font-medium text-gray-500">Etapa</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500">Promedio (días)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {avg_time_per_stage.map((t, i) => (
                <tr key={i}>
                  <td className="py-2 text-gray-700">{t.stage_name}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{t.avg_days}</td>
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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/terceros/crm/ConversionTab.tsx
git commit -m "feat: add ConversionTab with funnel, rates, and time metrics"
```

---

### Task 6: Reuniones Tab Component

**Files:**
- Create: `app/(admin)/terceros/crm/ReunionesTab.tsx`

- [ ] **Step 1: Create ReunionesTab.tsx**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { fetchMeetingsData, type MeetingsData } from '@/lib/actions/crm-keycontact'

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
function quarterStart(): string { const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(1); return d.toISOString().slice(0, 10) }

const PRESETS = [
  { label: 'Semana', desde: () => daysAgo(7), hasta: () => today() },
  { label: 'Mes', desde: () => monthStart(), hasta: () => today() },
  { label: 'Trimestre', desde: () => quarterStart(), hasta: () => today() },
]

export default function ReunionesTab({ data: initialData }: { data: MeetingsData }) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(today())
  const [activePreset, setActivePreset] = useState<number | null>(1)
  const [isPending, startTransition] = useTransition()

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    startTransition(async () => { setData(await fetchMeetingsData(d, h)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  const { total, meetings } = data

  return (
    <div className={`space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p, i) => (
          <button key={i} onClick={() => handlePreset(i)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setActivePreset(null) }}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
        <span className="text-xs text-gray-400">a</span>
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setActivePreset(null) }}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
        <button onClick={() => reload(desde, hasta, null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Aplicar
        </button>
      </div>

      {/* KPI card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Reuniones agendadas</p>
          <p className="text-3xl font-bold text-gray-900">{total}</p>
        </div>
      </div>

      {/* Meetings table */}
      {meetings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Sin reuniones para este período.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Deal</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-700">{new Date(m.scheduled_date).toLocaleDateString('es-AR')}</td>
                  <td className="px-5 py-3 font-semibold text-gray-900">{m.deal_name}</td>
                  <td className="px-5 py-3 text-gray-600 capitalize">{m.meeting_type ?? '-'}</td>
                  <td className="px-5 py-3">
                    {m.executed_at ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        Ejecutada{m.outcome ? ` — ${m.outcome}` : ''}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        Agendada
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/terceros/crm/ReunionesTab.tsx
git commit -m "feat: add ReunionesTab with KPI card and meetings table"
```

---

### Task 7: CRM Page + Hub Card

**Files:**
- Create: `app/(admin)/terceros/crm/page.tsx`
- Modify: `app/(admin)/terceros/page.tsx`

- [ ] **Step 1: Create the CRM page with tabs**

Create `app/(admin)/terceros/crm/page.tsx`:

```typescript
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import FinanzasTabs from '@/app/(admin)/finanzas/FinanzasTabs'
import PipelineTab from './PipelineTab'
import ConversionTab from './ConversionTab'
import ReunionesTab from './ReunionesTab'
import { fetchPipelineData, fetchConversionData, fetchMeetingsData } from '@/lib/actions/crm-keycontact'

function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function today(): string { return new Date().toISOString().slice(0, 10) }

export default async function CRMPage() {
  const desde = daysAgo(30)
  const hasta = today()

  const [pipelineData, conversionData, meetingsData] = await Promise.all([
    fetchPipelineData(desde, hasta),
    fetchConversionData(desde, hasta),
    fetchMeetingsData(desde, hasta),
  ])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/terceros"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Terceros
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">CRM — Pipeline GOcelulares</h1>
      </div>

      <FinanzasTabs tabs={[
        {
          id: 'pipeline',
          label: 'Pipeline',
          content: <PipelineTab data={pipelineData} owners={pipelineData.owners} />,
        },
        {
          id: 'conversion',
          label: 'Conversión',
          content: <ConversionTab data={conversionData} />,
        },
        {
          id: 'reuniones',
          label: 'Reuniones',
          content: <ReunionesTab data={meetingsData} />,
        },
      ]} />
    </div>
  )
}
```

- [ ] **Step 2: Add CRM card back to Terceros hub**

In `app/(admin)/terceros/page.tsx`, replace:

```typescript
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
```

with:

```typescript
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/terceros/crm"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-blue-600 px-5 py-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-white">CRM</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">Pipeline GOcelulares — seguimiento comercial, conversión y reuniones</p>
          </div>
        </Link>

        <Link
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/terceros/crm/page.tsx app/\(admin\)/terceros/page.tsx
git commit -m "feat: add CRM page with tabs and restore CRM card in Terceros hub"
```

---

### Task 8: Deploy + Vercel Env Var

**Files:** None (deployment task)

- [ ] **Step 1: Add KEYCONTACT_DB_URL to Vercel**

Run:
```bash
echo 'postgresql://postgres.piiovisvcuyzxmarshxk:mOwVClljWNazVT69@aws-1-sa-east-1.pooler.supabase.com:6543/postgres' | npx vercel env add KEYCONTACT_DB_URL production --yes
```

- [ ] **Step 2: Push to master**

```bash
git push origin master
```

- [ ] **Step 3: Deploy to production**

Run: `npx vercel --prod --yes`
Expected: Build succeeds, deployment is ready.

- [ ] **Step 4: Verify in browser**

Open `https://gocelular360.vercel.app/terceros/crm` and confirm:
- Pipeline tab shows deals table and stage summary cards
- Conversión tab shows funnel and rates
- Reuniones tab shows meetings table
- Filters work correctly
