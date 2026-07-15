# Pase a Contabilidad: Pedidos en Transito - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select in-transit purchase orders (facturados) to include as separate lines in the monthly accounting report, with persistent storage for audit traceability.

**Architecture:** New Supabase table `pase_contabilidad_transito` stores selected pedido IDs per period with a snapshot of items and valuations. Server actions filter pedidos by transit status at month-end, calculate valuations via `getMejorPrecio`, and merge transit lines into the existing report. The client component adds a collapsible section with selectable pedido cards below the report table.

**Tech Stack:** Next.js server actions, Supabase, React client component (existing patterns)

---

### Task 1: Create migration for `pase_contabilidad_transito` table

**Files:**
- Create: `supabase/migrations/20260602_create_pase_contabilidad_transito.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
CREATE TABLE IF NOT EXISTS pase_contabilidad_transito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text NOT NULL,
  pedido_id text NOT NULL,
  categoria text NOT NULL,
  proveedor text NOT NULL,
  items jsonb NOT NULL,
  unidades integer NOT NULL,
  valuacion numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(periodo, pedido_id)
);

CREATE INDEX idx_pase_transito_periodo ON pase_contabilidad_transito(periodo);
```

- [ ] **Step 2: Run migration against Supabase**

Run: `npx supabase db push`
Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260602_create_pase_contabilidad_transito.sql
git commit -m "feat: add pase_contabilidad_transito table for in-transit order tracking"
```

---

### Task 2: Add server actions for transit pedidos

**Files:**
- Modify: `lib/actions/pase-contabilidad.ts`

- [ ] **Step 1: Add imports and types**

Add to top of `lib/actions/pase-contabilidad.ts`, after the existing imports:

```typescript
import { getPedidos } from './compras'
import { getMejorPrecio } from './compras'
import { buscarPrecio } from '@/lib/utils'

export interface PedidoTransito {
  id: string
  proveedorNombre: string
  categoria: string
  fecha: string
  items: { productoNombre: string; cantidad: number; precioUnit: number; subtotal: number }[]
  unidades: number
  valuacion: number
  seleccionado: boolean // ya guardado en DB para este periodo
}
```

- [ ] **Step 2: Add `fetchPedidosEnTransito` function**

Append to `lib/actions/pase-contabilidad.ts`:

```typescript
export async function fetchPedidosEnTransito(periodo: string): Promise<PedidoTransito[]> {
  const [anio, mes] = periodo.split('-').map(Number)
  const ultimoDia = new Date(anio, mes, 0)
  const ultimoDiaStr = ultimoDia.toISOString().slice(0, 10) + 'T23:59:59'

  const pedidos = await getPedidos()
  const precios = await getMejorPrecio()

  // Pedidos ya seleccionados para este periodo
  const sb = createAdminClient()
  const { data: seleccionados } = await sb
    .from('pase_contabilidad_transito')
    .select('pedido_id')
    .eq('periodo', periodo)
  const idsSeleccionados = new Set((seleccionados ?? []).map(s => s.pedido_id))

  // Filtrar pedidos en transito al cierre del mes
  const enTransito = pedidos.filter(p => {
    if (p.estado !== 'enviado') return false
    // Enviado antes o durante el mes
    if (!p.confirmadoAt || p.confirmadoAt > ultimoDiaStr) return false
    // No recibido al cierre del mes
    if (p.entregadoAt && p.entregadoAt <= ultimoDiaStr) return false
    return true
  })

  return enTransito.map(p => {
    const items = p.items.map(item => {
      const precioUnit = buscarPrecio(precios, item.productoNombre)
      return {
        productoNombre: item.productoNombre,
        cantidad: item.cantidad,
        precioUnit,
        subtotal: item.cantidad * precioUnit,
      }
    })
    const unidades = items.reduce((s, i) => s + i.cantidad, 0)
    const valuacion = items.reduce((s, i) => s + i.subtotal, 0)
    return {
      id: p.id,
      proveedorNombre: p.proveedorNombre,
      categoria: p.categoria ?? 'Celulares',
      fecha: p.fecha,
      items,
      unidades,
      valuacion,
      seleccionado: idsSeleccionados.has(p.id),
    }
  })
}
```

- [ ] **Step 3: Add `guardarTransitoSeleccion` function**

Append to `lib/actions/pase-contabilidad.ts`:

```typescript
export async function guardarTransitoSeleccion(
  periodo: string,
  pedidos: { id: string; categoria: string; proveedor: string; items: { productoNombre: string; cantidad: number; precioUnit: number; subtotal: number }[]; unidades: number; valuacion: number }[]
): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()

  // Borrar seleccion anterior del periodo
  await sb.from('pase_contabilidad_transito').delete().eq('periodo', periodo)

  if (pedidos.length === 0) {
    revalidatePath('/pase-contabilidad')
    return { ok: true }
  }

  const rows = pedidos.map(p => ({
    periodo,
    pedido_id: p.id,
    categoria: p.categoria,
    proveedor: p.proveedor,
    items: JSON.stringify(p.items),
    unidades: p.unidades,
    valuacion: p.valuacion,
  }))

  const { error } = await sb.from('pase_contabilidad_transito').insert(rows)
  if (error) return { error: error.message }

  revalidatePath('/pase-contabilidad')
  return { ok: true }
}
```

- [ ] **Step 4: Modify `fetchReporteContabilidad` to include transit lines**

In `fetchReporteContabilidad`, before the `const completo` line, add:

```typescript
  // Agregar lineas de transito facturado
  const { data: transito } = await sb
    .from('pase_contabilidad_transito')
    .select('categoria, unidades, valuacion')
    .eq('periodo', periodo)

  if (transito && transito.length > 0) {
    // Agrupar por categoria
    const transitoPorCat: Record<string, { unidades: number; valuacion: number }> = {}
    for (const t of transito) {
      if (!transitoPorCat[t.categoria]) transitoPorCat[t.categoria] = { unidades: 0, valuacion: 0 }
      transitoPorCat[t.categoria].unidades += t.unidades
      transitoPorCat[t.categoria].valuacion += Number(t.valuacion)
    }
    for (const [cat, vals] of Object.entries(transitoPorCat)) {
      lineas.push({
        categoria: `${cat} - En transito facturados`,
        stockFinal: vals.unidades,
        valuacion: vals.valuacion,
        estado: 'ok',
        nota: null,
      })
    }
  }
```

- [ ] **Step 5: Add `revalidatePath` import**

Add to the import section if not present:

```typescript
import { revalidatePath } from 'next/cache'
```

- [ ] **Step 6: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add lib/actions/pase-contabilidad.ts
git commit -m "feat: add server actions for transit pedidos in pase contabilidad"
```

---

### Task 3: Update client component with transit selection UI

**Files:**
- Modify: `app/(admin)/pase-contabilidad/PaseContabilidadClient.tsx`

- [ ] **Step 1: Add imports and state**

Update imports at top of file:

```typescript
import { fetchReporteContabilidad, fetchPedidosEnTransito, guardarTransitoSeleccion, type ReporteContabilidad, type PedidoTransito } from '@/lib/actions/pase-contabilidad'
```

Add state inside the component, after the existing state declarations:

```typescript
const [pedidosTransito, setPedidosTransito] = useState<PedidoTransito[]>([])
const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
const [guardandoTransito, setGuardandoTransito] = useState(false)
const [transitoAbierto, setTransitoAbierto] = useState(false)
```

- [ ] **Step 2: Load transit pedidos when period changes**

Modify `handleChangePeriodo` to also fetch transit pedidos:

```typescript
function handleChangePeriodo(p: string) {
  setPeriodo(p)
  startTransition(async () => {
    const [r, t] = await Promise.all([
      fetchReporteContabilidad(p),
      fetchPedidosEnTransito(p),
    ])
    setReporte(r)
    setPedidosTransito(t)
    setSeleccion(new Set(t.filter(pt => pt.seleccionado).map(pt => pt.id)))
  })
}
```

Also load transit pedidos on initial render. Add a useEffect or update the initial state. Add after the state declarations:

```typescript
const [initialLoaded, setInitialLoaded] = useState(false)
```

And add a useEffect:

```typescript
import { useState, useTransition, useEffect } from 'react'
```

```typescript
useEffect(() => {
  if (periodo && !initialLoaded) {
    setInitialLoaded(true)
    fetchPedidosEnTransito(periodo).then(t => {
      setPedidosTransito(t)
      setSeleccion(new Set(t.filter(pt => pt.seleccionado).map(pt => pt.id)))
    })
  }
}, [periodo, initialLoaded])
```

- [ ] **Step 3: Add toggle selection handler**

```typescript
function toggleSeleccion(id: string) {
  setSeleccion(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

async function handleGuardarTransito() {
  setGuardandoTransito(true)
  const seleccionados = pedidosTransito
    .filter(p => seleccion.has(p.id))
    .map(p => ({
      id: p.id,
      categoria: p.categoria,
      proveedor: p.proveedorNombre,
      items: p.items,
      unidades: p.unidades,
      valuacion: p.valuacion,
    }))
  await guardarTransitoSeleccion(periodo, seleccionados)
  const r = await fetchReporteContabilidad(periodo)
  setReporte(r)
  setGuardandoTransito(false)
}
```

- [ ] **Step 4: Add transit section JSX**

Add this JSX after the PDF button section (before the closing `</>` of the `{reporte && (` block):

```tsx
{/* Pedidos en transito */}
{pedidosTransito.length > 0 && (
  <div className="mt-6">
    <button
      onClick={() => setTransitoAbierto(!transitoAbierto)}
      className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-3"
    >
      <svg className={`w-4 h-4 transition-transform ${transitoAbierto ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      Pedidos en transito ({pedidosTransito.length})
    </button>

    {transitoAbierto && (
      <div className="space-y-3">
        <p className="text-xs text-gray-500 mb-2">
          Selecciona los pedidos facturados en {formatPeriodo(periodo)} para incluirlos en el reporte como mercaderia en transito.
        </p>
        {pedidosTransito.map(p => (
          <div
            key={p.id}
            onClick={() => toggleSeleccion(p.id)}
            className={`border rounded-xl p-4 cursor-pointer transition-colors ${
              seleccion.has(p.id)
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={seleccion.has(p.id)}
                  onChange={() => toggleSeleccion(p.id)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <div>
                  <span className="font-semibold text-gray-900 text-sm">{p.proveedorNombre}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.categoria}</span>
                </div>
              </div>
              <span className="text-xs text-gray-400">{new Date(p.fecha).toLocaleDateString('es-AR')}</span>
            </div>
            <div className="ml-7 space-y-1">
              {p.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-600">
                  <span>{item.productoNombre} x{item.cantidad}</span>
                  <span>{formatearMoneda(item.subtotal)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-semibold text-gray-900 pt-1 border-t border-gray-100">
                <span>{p.unidades} unidades</span>
                <span>{formatearMoneda(p.valuacion)}</span>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={handleGuardarTransito}
          disabled={guardandoTransito}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {guardandoTransito ? 'Guardando...' : 'Confirmar seleccion'}
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/pase-contabilidad/PaseContabilidadClient.tsx
git commit -m "feat: add transit pedido selection UI in pase contabilidad"
```

---

### Task 4: Update PDF to include transit lines

**Files:**
- Modify: `app/api/pdf/pase-contabilidad/route.tsx`

No code changes needed. The PDF route already calls `fetchReporteContabilidad(periodo)` which now includes transit lines in `reporte.lineas`. The existing row rendering loop will automatically include the new "Celulares - En transito facturados" lines.

- [ ] **Step 1: Verify by reading the PDF route**

Confirm that the PDF route iterates `reporte.lineas` without filtering — it already does at lines 16-29.

- [ ] **Step 2: Test end-to-end**

Run: `npm run dev`
1. Go to /pase-contabilidad
2. Select a period that has pedidos en transito
3. Expand "Pedidos en transito" section
4. Select one or more pedidos
5. Click "Confirmar seleccion"
6. Verify the report table updates with transit line
7. Click "Descargar PDF" and verify transit line appears

- [ ] **Step 3: Final build check**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit and deploy**

```bash
git add -A
git commit -m "feat: complete pase contabilidad transit pedidos feature"
npx vercel --prod --yes
```
