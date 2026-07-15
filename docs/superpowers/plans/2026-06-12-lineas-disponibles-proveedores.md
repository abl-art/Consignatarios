# Líneas Disponibles de Proveedores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show available supplier credit lines on the Compras page by syncing check data from a Google Sheet and subtracting non-matured checks from each supplier's manually-set credit limit.

**Architecture:** New Supabase table `cheques_proveedor` stores check data synced from a public Google Sheet CSV. A cron job (daily 18:00 ART) and manual button trigger full-replace syncs. A new `LineasDisponiblesChart` component renders a horizontal timeline per supplier showing when credit frees up as checks mature. Suppliers get a new `limite_cuenta_corriente` field.

**Tech Stack:** Next.js 14, Supabase (admin client), Vercel Cron, Google Sheets CSV export, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260612_create_cheques_proveedor.sql` | Create | DB migration: table + indexes + alter proveedores |
| `app/api/cron/sync-cheques/route.ts` | Create | Cron/manual endpoint: fetch CSV, parse, full-replace table |
| `lib/actions/compras.ts` | Modify | Add queries: getChequesPorProveedor, getLastSyncCheques, triggerSyncCheques |
| `app/(admin)/compras/proveedores/ProveedoresClient.tsx` | Modify | Add limite_cuenta_corriente field to form |
| `app/(admin)/compras/page.tsx` | Modify | Fetch cheque data, render LineasDisponiblesChart |
| `app/(admin)/compras/LineasDisponiblesChart.tsx` | Create | Client component: timeline visualization |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260612_create_cheques_proveedor.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Tabla de cheques sincronizados desde Google Sheet
CREATE TABLE IF NOT EXISTS cheques_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuit text NOT NULL,
  nombre text,
  numero_cheque text,
  importe numeric NOT NULL,
  fecha_pago date NOT NULL,
  estado_cheque text,
  synced_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cheques_proveedor_cuit ON cheques_proveedor (cuit);
CREATE INDEX IF NOT EXISTS idx_cheques_proveedor_fecha ON cheques_proveedor (fecha_pago);

-- Campo límite de cuenta corriente en proveedores
ALTER TABLE compras_proveedores ADD COLUMN IF NOT EXISTS limite_cuenta_corriente numeric;
```

- [ ] **Step 2: Run migration against Supabase**

Run the SQL in the Supabase dashboard SQL editor for project `rnjxmmcsxmyaktseegvt`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612_create_cheques_proveedor.sql
git commit -m "feat: add cheques_proveedor table and limite_cuenta_corriente field"
```

---

### Task 2: Sync Cheques API Endpoint

**Files:**
- Create: `app/api/cron/sync-cheques/route.ts`

- [ ] **Step 1: Create the sync endpoint**

```typescript
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1fbcEB5o9nERC6BTmf94nVqOsKpJ3KJ6tVG_UPPbuaqg/gviz/tq?tqx=out:csv&sheet=cheques'

function parseImporte(raw: string): number {
  // "$1.500.000,00" → 1500000.00
  const cleaned = raw.replace(/[$"]/g, '').replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

function parseFecha(raw: string): string | null {
  // "6/1/2026" → "2026-01-06"
  const parts = raw.replace(/"/g, '').split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(SHEET_CSV_URL)
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
    const text = await res.text()
    const lines = text.split('\n').filter(l => l.trim())

    // Skip header row
    const rows = lines.slice(1)

    const cheques: {
      cuit: string
      nombre: string
      numero_cheque: string
      importe: number
      fecha_pago: string
      estado_cheque: string
    }[] = []

    for (const line of rows) {
      const cols = parseCSVLine(line)
      const cuit = (cols[3] || '').replace(/"/g, '').trim()
      const fechaPago = parseFecha(cols[6] || '')
      const importe = parseImporte(cols[7] || '')

      if (!cuit || !fechaPago || importe <= 0) continue

      cheques.push({
        cuit,
        nombre: (cols[4] || '').replace(/"/g, '').trim(),
        numero_cheque: (cols[0] || '').replace(/"/g, '').trim(),
        importe,
        fecha_pago: fechaPago,
        estado_cheque: (cols[2] || '').replace(/"/g, '').trim(),
      })
    }

    const supabase = createAdminClient()

    // Full replace: delete all, insert batch
    await supabase.from('cheques_proveedor').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // Insert in batches of 500
    for (let i = 0; i < cheques.length; i += 500) {
      const batch = cheques.slice(i, i + 500)
      const { error } = await supabase.from('cheques_proveedor').insert(batch)
      if (error) throw new Error(`Insert batch error: ${error.message}`)
    }

    // Update last sync timestamp
    await supabase.from('flujo_config').upsert(
      { key: 'cheques_last_sync', value: new Date().toISOString() },
      { onConflict: 'key' }
    )

    return NextResponse.json({ ok: true, count: cheques.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Add cron to vercel.json**

Add to the existing `crons` array in `vercel.json`:

```json
{
  "path": "/api/cron/sync-cheques",
  "schedule": "0 21 * * *"
}
```

- [ ] **Step 3: Test manually with curl**

Set the CRON_SECRET env var and run:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-cheques
```
Expected: `{"ok":true,"count":<number>}`

Verify in Supabase that `cheques_proveedor` table has rows and `flujo_config` has `cheques_last_sync`.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/sync-cheques/route.ts vercel.json
git commit -m "feat: add sync-cheques cron endpoint for Google Sheet CSV import"
```

---

### Task 3: Server Actions for Cheques & Límite

**Files:**
- Modify: `lib/actions/compras.ts`

- [ ] **Step 1: Add ProveedorInput field and update CRUD**

In `lib/actions/compras.ts`, add `limite_cuenta_corriente` to `ProveedorInput`:

```typescript
interface ProveedorInput {
  nombre: string
  contacto: string
  whatsapp: string
  email: string
  cuit: string
  direccion: string
  notas: string
  limite_cuenta_corriente?: number | null
}
```

In `agregarProveedor`, add to the insert object:
```typescript
limite_cuenta_corriente: input.limite_cuenta_corriente ?? null,
```

In `editarProveedor`, add to the update object:
```typescript
limite_cuenta_corriente: input.limite_cuenta_corriente ?? null,
```

- [ ] **Step 2: Add cheques query functions**

Append to `lib/actions/compras.ts`:

```typescript
// ---------------------------------------------------------------------------
// Cheques & Líneas disponibles
// ---------------------------------------------------------------------------

export async function getLineasDisponibles() {
  const supabase = createAdminClient()

  // Get proveedores with limite set
  const { data: proveedores } = await supabase
    .from('compras_proveedores')
    .select('id, nombre, cuit, limite_cuenta_corriente')
    .not('limite_cuenta_corriente', 'is', null)
    .order('nombre')

  if (!proveedores || proveedores.length === 0) return []

  const hoy = new Date().toISOString().slice(0, 10)

  // Get all non-matured cheques for these CUITs
  const cuits = proveedores.map(p => p.cuit).filter(Boolean)
  const { data: cheques } = await supabase
    .from('cheques_proveedor')
    .select('cuit, importe, fecha_pago')
    .in('cuit', cuits)
    .gte('fecha_pago', hoy)
    .order('fecha_pago')

  // Group cheques by CUIT
  const chequesByCuit: Record<string, { importe: number; fecha_pago: string }[]> = {}
  for (const ch of cheques || []) {
    if (!chequesByCuit[ch.cuit]) chequesByCuit[ch.cuit] = []
    chequesByCuit[ch.cuit].push({ importe: ch.importe, fecha_pago: ch.fecha_pago })
  }

  return proveedores.map(p => {
    const chequesProveedor = chequesByCuit[p.cuit] || []
    const totalPendiente = chequesProveedor.reduce((s, c) => s + c.importe, 0)
    const limite = p.limite_cuenta_corriente || 0
    const disponible = limite - totalPendiente

    return {
      id: p.id,
      nombre: p.nombre,
      cuit: p.cuit,
      limite,
      totalPendiente,
      disponible,
      cheques: chequesProveedor,
    }
  })
}

export async function getLastSyncCheques(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('flujo_config')
    .select('value')
    .eq('key', 'cheques_last_sync')
    .single()
  return data?.value ?? null
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/actions/compras.ts
git commit -m "feat: add cheques queries and limite_cuenta_corriente to proveedor CRUD"
```

---

### Task 4: Límite Field in Proveedores Form

**Files:**
- Modify: `app/(admin)/compras/proveedores/ProveedoresClient.tsx`

- [ ] **Step 1: Add limite state and update interface**

In `ProveedoresClient.tsx`, update the `Proveedor` interface (line 8) to add:
```typescript
limite_cuenta_corriente: number | null
```

Add state in the component (after line 55):
```typescript
const [limiteCta, setLimiteCta] = useState('')
```

In `resetForm()` (line 58), add:
```typescript
setLimiteCta('')
```

In `startEdit()` (line 69), add after the other setters:
```typescript
setLimiteCta(p.limite_cuenta_corriente ? String(p.limite_cuenta_corriente) : '')
```

In `handleSubmit()` (line 108), add to the `data` object:
```typescript
limite_cuenta_corriente: limiteCta ? Number(limiteCta) : null,
```

- [ ] **Step 2: Add the form field in the UI**

After the email field `</div>` (end of the grid around line 174), add a new field inside the same grid:

```tsx
<div>
  <label className="block text-xs font-medium text-gray-600 mb-1">Límite cuenta corriente</label>
  <input type="number" value={limiteCta} onChange={(e) => setLimiteCta(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Ej: 50000000" />
</div>
```

- [ ] **Step 3: Show limite in the provider card**

In the provider card rendering (around line 258, after the plazos badge), add:

```tsx
{p.limite_cuenta_corriente && (
  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
    Línea: ${(p.limite_cuenta_corriente / 1_000_000).toFixed(0)}M
  </span>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/(admin)/compras/proveedores/ProveedoresClient.tsx
git commit -m "feat: add limite_cuenta_corriente field to proveedores form"
```

---

### Task 5: LineasDisponiblesChart Component

**Files:**
- Create: `app/(admin)/compras/LineasDisponiblesChart.tsx`

- [ ] **Step 1: Create the timeline chart component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'

interface Cheque {
  importe: number
  fecha_pago: string
}

interface LineaProveedor {
  id: string
  nombre: string
  cuit: string
  limite: number
  totalPendiente: number
  disponible: number
  cheques: Cheque[]
}

interface Props {
  lineas: LineaProveedor[]
  lastSync: string | null
}

export default function LineasDisponiblesChart({ lineas, lastSync }: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/cron/sync-cheques', {
        headers: { 'Authorization': `Bearer ${window.__CRON_SECRET || 'manual'}` },
      })
      router.refresh()
    } catch {
      // silently fail
    } finally {
      setSyncing(false)
    }
  }

  if (lineas.length === 0) return null

  // Timeline range: today to +90 days
  const hoy = new Date()
  const fin = new Date(hoy)
  fin.setDate(fin.getDate() + 90)
  const totalDias = 90

  function dayOffset(fechaStr: string): number {
    const fecha = new Date(fechaStr + 'T00:00:00')
    const diff = Math.round((fecha.getTime() - hoy.getTime()) / 86400000)
    return Math.max(0, Math.min(diff, totalDias))
  }

  function pctColor(disponible: number, limite: number): string {
    if (limite <= 0) return 'text-gray-500'
    const pct = (disponible / limite) * 100
    if (pct > 50) return 'text-green-600'
    if (pct >= 20) return 'text-yellow-600'
    return 'text-red-600'
  }

  function barColor(disponible: number, limite: number): string {
    if (limite <= 0) return 'bg-gray-300'
    const pct = (disponible / limite) * 100
    if (pct > 50) return 'bg-green-500'
    if (pct >= 20) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  // Group cheques by date for each proveedor
  function groupCheques(cheques: Cheque[]): { fecha: string; total: number; offset: number }[] {
    const map: Record<string, number> = {}
    for (const ch of cheques) {
      if (!map[ch.fecha_pago]) map[ch.fecha_pago] = 0
      map[ch.fecha_pago] += ch.importe
    }
    return Object.entries(map)
      .map(([fecha, total]) => ({ fecha, total, offset: dayOffset(fecha) }))
      .filter(g => g.offset > 0 && g.offset < totalDias)
      .sort((a, b) => a.offset - b.offset)
  }

  // Month labels for the timeline axis
  const monthLabels: { label: string; pct: number }[] = []
  for (let i = 0; i <= 3; i++) {
    const d = new Date(hoy)
    d.setMonth(d.getMonth() + i, 1)
    if (d > fin) break
    const offset = Math.round((d.getTime() - hoy.getTime()) / 86400000)
    if (offset >= 0 && offset <= totalDias) {
      monthLabels.push({
        label: d.toLocaleDateString('es-AR', { month: 'short' }),
        pct: (offset / totalDias) * 100,
      })
    }
  }

  const syncLabel = lastSync
    ? new Date(lastSync).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'nunca'

  return (
    <div className="mt-8 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Líneas disponibles</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Última sync: {syncLabel}</span>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Sincronizar cheques"
          >
            <svg className={`w-4 h-4 text-gray-500 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {lineas.map((linea) => {
          const grupos = groupCheques(linea.cheques)
          const dispPct = linea.limite > 0 ? (linea.disponible / linea.limite) * 100 : 0

          return (
            <div key={linea.id}>
              {/* Proveedor header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{linea.nombre}</span>
                  <span className={`text-sm font-semibold ${pctColor(linea.disponible, linea.limite)}`}>
                    {formatearMoneda(linea.disponible)} disponible
                  </span>
                  <span className="text-xs text-gray-400">de {formatearMoneda(linea.limite)}</span>
                </div>
                <span className={`text-xs font-semibold ${pctColor(linea.disponible, linea.limite)}`}>
                  {Math.round(dispPct)}%
                </span>
              </div>

              {/* Usage bar */}
              <div className="h-2 bg-gray-100 rounded-full mb-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor(linea.disponible, linea.limite)}`}
                  style={{ width: `${Math.min(100, Math.max(0, 100 - dispPct))}%` }}
                />
              </div>

              {/* Timeline */}
              <div className="relative h-10 bg-gray-50 rounded-lg border border-gray-100">
                {/* Month markers */}
                {monthLabels.map((ml) => (
                  <div
                    key={ml.label}
                    className="absolute top-0 h-full border-l border-gray-200"
                    style={{ left: `${ml.pct}%` }}
                  >
                    <span className="absolute -top-4 text-[10px] text-gray-400 -translate-x-1/2">
                      {ml.label}
                    </span>
                  </div>
                ))}

                {/* Cheque dots */}
                {grupos.map((g) => (
                  <div
                    key={g.fecha}
                    className="absolute top-1/2 -translate-y-1/2 group"
                    style={{ left: `${(g.offset / totalDias) * 100}%` }}
                  >
                    <div className="w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm cursor-pointer hover:scale-125 transition-transform" />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                      <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg">
                        <div className="font-semibold">{formatearMoneda(g.total)}</div>
                        <div className="text-gray-300">{new Date(g.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Today marker */}
                <div className="absolute top-0 h-full border-l-2 border-indigo-300" style={{ left: '0%' }}>
                  <span className="absolute -top-4 text-[10px] text-indigo-500 font-medium">hoy</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/(admin)/compras/LineasDisponiblesChart.tsx
git commit -m "feat: add LineasDisponiblesChart timeline component"
```

---

### Task 6: Integrate Chart into Compras Page

**Files:**
- Modify: `app/(admin)/compras/page.tsx`

- [ ] **Step 1: Add imports and data fetching**

At the top of `page.tsx`, add imports:
```typescript
import { getProveedores, getProductos, getPedidos, getLineasDisponibles, getLastSyncCheques } from '@/lib/actions/compras'
import LineasDisponiblesChart from './LineasDisponiblesChart'
```

Update the Promise.all (line 10) to include the new fetches:
```typescript
const [proveedores, productos, pedidos, lineas, lastSync] = await Promise.all([
  getProveedores(),
  getProductos(),
  getPedidos(),
  getLineasDisponibles(),
  getLastSyncCheques(),
])
```

- [ ] **Step 2: Add chart to JSX**

In the return JSX, insert the `LineasDisponiblesChart` after the cards grid `</div>` (after line 117) and before the `{/* Resumen en tránsito por modelo */}` comment (line 119):

```tsx
      <LineasDisponiblesChart lineas={lineas} lastSync={lastSync} />
```

- [ ] **Step 3: Fix the sync button auth**

The sync button in `LineasDisponiblesChart` calls the endpoint with a bearer token. For the manual button we need to allow it. Update the sync endpoint `app/api/cron/sync-cheques/route.ts` to also accept POST without auth from the same origin (server action approach is simpler).

Instead, add a server action to `lib/actions/compras.ts`:

```typescript
export async function triggerSyncCheques() {
  const url = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/cron/sync-cheques`
    : 'http://localhost:3000/api/cron/sync-cheques'
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
  })
  if (!res.ok) throw new Error('Sync failed')
  revalidatePath('/compras')
  return res.json()
}
```

Then update `LineasDisponiblesChart.tsx` to use the server action instead of fetch:

Replace the import section:
```tsx
import { triggerSyncCheques } from '@/lib/actions/compras'
```

Replace `handleSync`:
```typescript
async function handleSync() {
  setSyncing(true)
  try {
    await triggerSyncCheques()
    router.refresh()
  } catch {
    // silently fail
  } finally {
    setSyncing(false)
  }
}
```

Remove the old `fetch('/api/cron/sync-cheques', ...)` call.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Test locally**

1. Start dev server: `npm run dev`
2. Navigate to `/compras`
3. Verify "Líneas disponibles" section appears between cards and "En tránsito por modelo"
4. Click sync button, verify it fetches and refreshes
5. Verify providers without `limite_cuenta_corriente` don't appear

- [ ] **Step 6: Commit**

```bash
git add app/(admin)/compras/page.tsx app/(admin)/compras/LineasDisponiblesChart.tsx lib/actions/compras.ts
git commit -m "feat: integrate LineasDisponiblesChart into Compras page with sync button"
```

---

### Task 7: Deploy and Verify

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Deploy to production**

```bash
npx vercel --prod --yes
```

- [ ] **Step 3: Verify on production**

1. Go to https://gocelular360.vercel.app/compras
2. Verify the timeline chart appears
3. Click sync button
4. Go to `/compras/proveedores`, edit a provider, set a límite
5. Go back to `/compras`, verify the provider appears in the chart
6. Verify cron is registered in Vercel dashboard under Crons tab

- [ ] **Step 4: Commit any remaining fixes**
