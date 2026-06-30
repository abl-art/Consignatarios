# Lista de Precios Mayorista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a wholesale price list page under Consignatarios with configurable MUP markup, per-product visibility toggles, and PDF export.

**Architecture:** Server component loads products (Celulares only) with best supplier prices and MUP config from Supabase. Client component renders an interactive table with visibility toggles and MUP input. PDF generated via `@react-pdf/renderer` API route, showing only visible products with sale prices (no cost).

**Tech Stack:** Next.js 14 App Router, Supabase, TailwindCSS, @react-pdf/renderer

---

### Task 1: Database — Add `lista_precios_config` table and `oculto_lista_precios` column

**Files:**
- Modify: Supabase database (via SQL)

- [ ] **Step 1: Run SQL migration**

Execute in Supabase SQL editor or via CLI:

```sql
-- Config table for MUP percentage (singleton row)
CREATE TABLE IF NOT EXISTS lista_precios_config (
  id serial PRIMARY KEY,
  mup_porcentaje numeric NOT NULL DEFAULT 30,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default row
INSERT INTO lista_precios_config (mup_porcentaje) VALUES (30)
ON CONFLICT DO NOTHING;

-- Add visibility column to compras_productos
ALTER TABLE compras_productos
ADD COLUMN IF NOT EXISTS oculto_lista_precios boolean DEFAULT false;
```

- [ ] **Step 2: Verify**

Check that `lista_precios_config` has one row with `mup_porcentaje = 30` and that `compras_productos` has the new `oculto_lista_precios` column.

---

### Task 2: Server Actions — Create `lib/actions/lista-precios.ts`

**Files:**
- Create: `lib/actions/lista-precios.ts`

- [ ] **Step 1: Create the server actions file**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Read config
// ---------------------------------------------------------------------------

export async function getMupConfig(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('lista_precios_config')
    .select('mup_porcentaje')
    .limit(1)
    .single()
  return data?.mup_porcentaje ?? 30
}

// ---------------------------------------------------------------------------
// Update MUP
// ---------------------------------------------------------------------------

export async function actualizarMup(porcentaje: number) {
  const supabase = createAdminClient()
  // Update the singleton row (id=1)
  const { error } = await supabase
    .from('lista_precios_config')
    .update({ mup_porcentaje: porcentaje, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/consignatarios/lista-precios')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Toggle product visibility in price list
// ---------------------------------------------------------------------------

export async function toggleVisibilidadListaPrecios(productoId: string, oculto: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('compras_productos')
    .update({ oculto_lista_precios: oculto })
    .eq('id', productoId)
  if (error) return { error: error.message }
  revalidatePath('/consignatarios/lista-precios')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Get celulares with best price
// ---------------------------------------------------------------------------

export interface ProductoConPrecio {
  id: string
  nombre: string
  codigo: string
  mejor_precio: number
  oculto_lista_precios: boolean
}

export async function getProductosCelularesConPrecio(): Promise<ProductoConPrecio[]> {
  const supabase = createAdminClient()

  // Get celulares products
  const { data: productos } = await supabase
    .from('compras_productos')
    .select('id, nombre, codigo, oculto_lista_precios')
    .eq('categoria', 'Celulares')
    .eq('oculto', false)
    .order('nombre')

  if (!productos || productos.length === 0) return []

  // Get all prices
  const { data: precios } = await supabase
    .from('compras_precios')
    .select('producto_id, precio')

  if (!precios) return []

  // Build best price map
  const mejorPrecio: Record<string, number> = {}
  for (const p of precios) {
    const precio = Number(p.precio)
    if (!mejorPrecio[p.producto_id] || precio < mejorPrecio[p.producto_id]) {
      mejorPrecio[p.producto_id] = precio
    }
  }

  // Combine: only products that have at least one price
  return productos
    .filter(p => mejorPrecio[p.id] !== undefined)
    .map(p => ({
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      mejor_precio: mejorPrecio[p.id],
      oculto_lista_precios: p.oculto_lista_precios ?? false,
    }))
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/lista-precios.ts
git commit -m "feat: add server actions for lista de precios (MUP config, visibility toggle, products with best price)"
```

---

### Task 3: Server Page — Create `app/(admin)/consignatarios/lista-precios/page.tsx`

**Files:**
- Create: `app/(admin)/consignatarios/lista-precios/page.tsx`

- [ ] **Step 1: Create the server page**

```tsx
export const dynamic = 'force-dynamic'

import { getMupConfig, getProductosCelularesConPrecio } from '@/lib/actions/lista-precios'
import ListaPreciosClient from './ListaPreciosClient'

export default async function ListaPreciosPage() {
  const [mup, productos] = await Promise.all([
    getMupConfig(),
    getProductosCelularesConPrecio(),
  ])
  return <ListaPreciosClient productos={productos} mupInicial={mup} />
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/consignatarios/lista-precios/page.tsx
git commit -m "feat: add lista de precios server page"
```

---

### Task 4: Client Component — Create `ListaPreciosClient.tsx`

**Files:**
- Create: `app/(admin)/consignatarios/lista-precios/ListaPreciosClient.tsx`

- [ ] **Step 1: Create the client component**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { actualizarMup, toggleVisibilidadListaPrecios } from '@/lib/actions/lista-precios'
import type { ProductoConPrecio } from '@/lib/actions/lista-precios'

interface Props {
  productos: ProductoConPrecio[]
  mupInicial: number
}

export default function ListaPreciosClient({ productos, mupInicial }: Props) {
  const [mup, setMup] = useState(mupInicial)
  const [savingMup, startSavingMup] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const router = useRouter()

  function handleMupChange(value: number) {
    setMup(value)
  }

  function handleMupBlur() {
    startSavingMup(async () => {
      await actualizarMup(mup)
      router.refresh()
    })
  }

  async function handleToggle(productoId: string, currentOculto: boolean) {
    setTogglingId(productoId)
    await toggleVisibilidadListaPrecios(productoId, !currentOculto)
    router.refresh()
    setTogglingId(null)
  }

  function calcPrecioVenta(costo: number) {
    return Math.round(costo * (1 + mup / 100))
  }

  function calcIva(precioVenta: number) {
    return Math.round(precioVenta * 0.21)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lista de Precios</h1>
          <p className="text-sm text-gray-500 mt-1">Precios mayoristas de celulares con MUP configurable</p>
        </div>
        <a
          href="/api/pdf/lista-precios"
          target="_blank"
          className="inline-flex items-center gap-2 px-4 py-2 bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar PDF
        </a>
      </div>

      {/* MUP Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">MUP (Margen de Utilidad):</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={200}
            value={mup}
            onChange={(e) => handleMupChange(Number(e.target.value))}
            onBlur={handleMupBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
          />
          <span className="text-sm text-gray-600">%</span>
        </div>
        {savingMup && <span className="text-xs text-gray-400">Guardando...</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio Costo (Neto)</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio Venta (Neto)</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">IVA (21%)</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio con IVA</th>
              <th className="text-center px-6 py-3 font-medium text-gray-600">Visible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {productos.map((p) => {
              const precioVenta = calcPrecioVenta(p.mejor_precio)
              const iva = calcIva(precioVenta)
              const precioConIva = precioVenta + iva
              const oculto = p.oculto_lista_precios

              return (
                <tr
                  key={p.id}
                  className={`hover:bg-gray-50 transition-colors ${oculto ? 'opacity-40' : ''}`}
                >
                  <td className={`px-6 py-3 font-medium text-gray-900 ${oculto ? 'line-through' : ''}`}>
                    {p.nombre}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {formatearMoneda(p.mejor_precio)}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900 tabular-nums">
                    {formatearMoneda(precioVenta)}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-500 tabular-nums">
                    {formatearMoneda(iva)}
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-magenta-700 tabular-nums">
                    {formatearMoneda(precioConIva)}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button
                      onClick={() => handleToggle(p.id, oculto)}
                      disabled={togglingId === p.id}
                      className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                      title={oculto ? 'Mostrar en lista' : 'Ocultar de lista'}
                    >
                      {oculto ? (
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.5 6.5m3.378 3.378L6.5 6.5m7.621 7.621L17.5 17.5m-3.379-3.379L17.5 17.5M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  No hay productos con precios cargados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/consignatarios/lista-precios/ListaPreciosClient.tsx
git commit -m "feat: add lista de precios client component with MUP input, visibility toggles, and price calculations"
```

---

### Task 5: PDF Component — Create `lib/pdf/lista-precios.tsx`

**Files:**
- Create: `lib/pdf/lista-precios.tsx`

- [ ] **Step 1: Create the PDF component**

```tsx
import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const MAGENTA = '#E91E7B'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    color: '#1a1a1a',
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: MAGENTA,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: MAGENTA,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  headerDate: {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
  },
  colModelo: {
    flex: 3,
  },
  colPrecio: {
    flex: 2,
    textAlign: 'right',
  },
  thText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    textTransform: 'uppercase',
  },
  tdModelo: {
    fontSize: 10,
    color: '#111827',
  },
  tdPrecio: {
    fontSize: 10,
    color: '#374151',
    textAlign: 'right',
  },
  tdPrecioFinal: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: MAGENTA,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
  },
})

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

interface Producto {
  nombre: string
  precio_venta_neto: number
  iva: number
  precio_con_iva: number
}

interface ListaPreciosPDFProps {
  productos: Producto[]
  fecha: string
}

export function ListaPreciosPDF({ productos, fecha }: ListaPreciosPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Lista de Precios — Celulares</Text>
          <Text style={styles.headerSubtitle}>GOcelular — Precios Mayoristas</Text>
          <Text style={styles.headerDate}>Fecha: {fecha}</Text>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <View style={styles.colModelo}>
            <Text style={styles.thText}>Modelo</Text>
          </View>
          <View style={styles.colPrecio}>
            <Text style={styles.thText}>Precio Neto</Text>
          </View>
          <View style={styles.colPrecio}>
            <Text style={styles.thText}>IVA (21%)</Text>
          </View>
          <View style={styles.colPrecio}>
            <Text style={styles.thText}>Precio con IVA</Text>
          </View>
        </View>

        {/* Table Rows */}
        {productos.map((p, i) => (
          <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <View style={styles.colModelo}>
              <Text style={styles.tdModelo}>{p.nombre}</Text>
            </View>
            <View style={styles.colPrecio}>
              <Text style={styles.tdPrecio}>{formatARS(p.precio_venta_neto)}</Text>
            </View>
            <View style={styles.colPrecio}>
              <Text style={styles.tdPrecio}>{formatARS(p.iva)}</Text>
            </View>
            <View style={styles.colPrecio}>
              <Text style={styles.tdPrecioFinal}>{formatARS(p.precio_con_iva)}</Text>
            </View>
          </View>
        ))}

        {/* Footer */}
        <Text style={styles.footer}>
          GOcelular — Lista de precios generada el {fecha}. Precios sujetos a cambio sin previo aviso.
        </Text>
      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/pdf/lista-precios.tsx
git commit -m "feat: add PDF component for lista de precios mayorista"
```

---

### Task 6: PDF API Route — Create `app/api/pdf/lista-precios/route.tsx`

**Files:**
- Create: `app/api/pdf/lista-precios/route.tsx`

- [ ] **Step 1: Create the API route**

```tsx
import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { getMupConfig, getProductosCelularesConPrecio } from '@/lib/actions/lista-precios'
import { ListaPreciosPDF } from '@/lib/pdf/lista-precios'

export async function GET() {
  const [mup, productos] = await Promise.all([
    getMupConfig(),
    getProductosCelularesConPrecio(),
  ])

  // Filter only visible products and calculate prices
  const productosVisibles = productos
    .filter(p => !p.oculto_lista_precios)
    .map(p => {
      const precio_venta_neto = Math.round(p.mejor_precio * (1 + mup / 100))
      const iva = Math.round(precio_venta_neto * 0.21)
      return {
        nombre: p.nombre,
        precio_venta_neto,
        iva,
        precio_con_iva: precio_venta_neto + iva,
      }
    })

  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const element = ListaPreciosPDF({ productos: productosVisibles, fecha })
  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="lista-precios-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/pdf/lista-precios/route.tsx
git commit -m "feat: add PDF generation API route for lista de precios"
```

---

### Task 7: Sidebar — Add "Lista de Precios" nav item

**Files:**
- Modify: `app/(admin)/layout.tsx:40` (after Dashboard item in Consignatarios children)

- [ ] **Step 1: Add nav item**

In `app/(admin)/layout.tsx`, find the Consignatarios children array. After the Dashboard item (`{ href: '/consignatarios/dashboard', label: 'Dashboard', icon: 'dashboard' }`), add:

```typescript
{ href: '/consignatarios/lista-precios', label: 'Lista de Precios', icon: 'ventas' },
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/layout.tsx
git commit -m "feat: add Lista de Precios link to sidebar under Consignatarios"
```

---

### Task 8: Verify — Test the full flow

- [ ] **Step 1: Start dev server and navigate to `/consignatarios/lista-precios`**

Run: `npm run dev`

Verify:
- Page loads with product table
- MUP input shows 30 (default)
- Price calculations are correct: venta = costo * 1.30, IVA = venta * 0.21
- Changing MUP updates all prices in real-time and persists on blur
- Eye toggle works and persists (hidden rows appear faded/strikethrough)

- [ ] **Step 2: Test PDF download**

Click "Descargar PDF" button. Verify:
- PDF opens in new tab
- Only visible (non-hidden) products appear
- Shows: Modelo, Precio Neto, IVA, Precio con IVA
- Does NOT show cost price
- Formatting and styling look correct

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete lista de precios mayorista feature"
```
