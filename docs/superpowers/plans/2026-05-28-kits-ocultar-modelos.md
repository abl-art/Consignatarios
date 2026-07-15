# Kits de Seguridad — Ocultar Modelos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al admin ocultar modelos de celulares en la página de Kits de Seguridad para que no aparezcan en la tabla, no se cuenten en los cálculos, y no se muestren al proveedor en el formulario de entrega.

**Architecture:** Una tabla Supabase `kits_modelos_ocultos` guarda los modelos ocultados (por nombre, que es la key de matching). Dos server actions (ocultar/mostrar) manejan el toggle. `getInventarioByCategoria` recibe un flag opcional para excluir ocultos. La página admin usa un client component wrapper para el toggle "Mostrar ocultos" y los botones de ojo por fila. La vista proveedor filtra los ocultos tanto en la tabla como en el desplegable del formulario de entrega.

**Tech Stack:** Supabase (tabla + queries), Next.js server actions, React client component

---

## File Structure

| Action | Path | Responsabilidad |
|--------|------|-----------------|
| Create | `supabase/migrations/20260528_create_kits_modelos_ocultos.sql` | Tabla para modelos ocultos |
| Create | `lib/actions/kits-ocultos.ts` | Server actions: ocultar, mostrar, listar modelos ocultos |
| Modify | `lib/actions/compras.ts:307-413` | Agregar param `excludeOcultos` a `getInventarioByCategoria` |
| Create | `app/(admin)/inventario/kits-seguridad/KitsTable.tsx` | Client component: tabla con botón ojo + toggle mostrar ocultos |
| Modify | `app/(admin)/inventario/kits-seguridad/page.tsx` | Server component que pasa datos al client component |
| Modify | `app/proveedor/kits/page.tsx` | Filtrar ocultos en tabla y en props del EntregaForm |

---

### Task 1: Crear tabla Supabase `kits_modelos_ocultos`

**Files:**
- Create: `supabase/migrations/20260528_create_kits_modelos_ocultos.sql`

- [ ] **Step 1: Crear la migración SQL**

```sql
CREATE TABLE IF NOT EXISTS kits_modelos_ocultos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  modelo text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);
```

Escribir en `supabase/migrations/20260528_create_kits_modelos_ocultos.sql`.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260528_create_kits_modelos_ocultos.sql
git commit -m "feat: create kits_modelos_ocultos table"
```

---

### Task 2: Crear server actions para ocultar/mostrar modelos

**Files:**
- Create: `lib/actions/kits-ocultos.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function getModelosOcultos(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('kits_modelos_ocultos')
    .select('modelo')
    .order('modelo')
  return (data ?? []).map(r => r.modelo)
}

export async function ocultarModelo(modelo: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('kits_modelos_ocultos')
    .upsert({ modelo }, { onConflict: 'modelo' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario/kits-seguridad')
  revalidatePath('/proveedor/kits')
  return { ok: true }
}

export async function mostrarModelo(modelo: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('kits_modelos_ocultos')
    .delete()
    .eq('modelo', modelo)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/inventario/kits-seguridad')
  revalidatePath('/proveedor/kits')
  return { ok: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/kits-ocultos.ts
git commit -m "feat: add server actions for hiding/showing kit models"
```

---

### Task 3: Modificar `getInventarioByCategoria` para excluir ocultos

**Files:**
- Modify: `lib/actions/compras.ts:307-413`

- [ ] **Step 1: Agregar import y parámetro**

Al inicio de la función `getInventarioByCategoria`, agregar un segundo parámetro opcional `modelosOcultos: string[]` con default `[]`. Justo antes del `return result.sort(...)` (línea ~412), filtrar:

```typescript
export async function getInventarioByCategoria(
  categoria: string,
  modelosOcultos: string[] = [],
): Promise<InventarioCategoria[]> {
```

Y antes del return final, agregar el filtro:

```typescript
  const ocultos = new Set(modelosOcultos.map(m => m.toLowerCase()))
  const filtered = ocultos.size > 0
    ? result.filter(r => !ocultos.has(r.modelo.toLowerCase()))
    : result

  return filtered.sort((a, b) => b.compras - a.compras)
```

Reemplazar la línea `return result.sort((a, b) => b.compras - a.compras)` con el código anterior.

- [ ] **Step 2: Verificar TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add lib/actions/compras.ts
git commit -m "feat: add modelosOcultos filter to getInventarioByCategoria"
```

---

### Task 4: Crear `KitsTable` client component para la vista admin

**Files:**
- Create: `app/(admin)/inventario/kits-seguridad/KitsTable.tsx`

Este componente recibe todos los items (visibles + ocultos) y maneja el toggle de visibilidad y los botones de ojo.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { ocultarModelo, mostrarModelo } from '@/lib/actions/kits-ocultos'

interface Item {
  modelo: string
  compras: number
  ventas: number
  disponible: number
  stockCelulares: number
  precioUnitario: number
  valuacion: number
}

interface Props {
  items: Item[]
  modelosOcultos: string[]
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
    </svg>
  )
}

export default function KitsTable({ items, modelosOcultos }: Props) {
  const [mostrarOcultos, setMostrarOcultos] = useState(false)
  const [pending, startTransition] = useTransition()
  const [ocultos, setOcultos] = useState<Set<string>>(new Set(modelosOcultos.map(m => m.toLowerCase())))

  const esOculto = (modelo: string) => ocultos.has(modelo.toLowerCase())

  const visibles = items.filter(r => !esOculto(r.modelo))
  const ocultosItems = items.filter(r => esOculto(r.modelo))
  const displayItems = mostrarOcultos ? items : visibles

  // Totales solo de visibles (no ocultos)
  const totalCompras = visibles.reduce((s, r) => s + r.compras, 0)
  const totalVentas = visibles.reduce((s, r) => s + r.ventas, 0)
  const totalDisponible = visibles.reduce((s, r) => s + r.disponible, 0)
  const totalValuacion = visibles.reduce((s, r) => s + r.valuacion, 0)
  const totalStockCel = visibles.reduce((s, r) => s + r.stockCelulares, 0)

  function handleToggle(modelo: string) {
    const hidden = esOculto(modelo)
    // Optimistic update
    setOcultos(prev => {
      const next = new Set(prev)
      if (hidden) {
        next.delete(modelo.toLowerCase())
      } else {
        next.add(modelo.toLowerCase())
      }
      return next
    })
    startTransition(async () => {
      if (hidden) {
        await mostrarModelo(modelo)
      } else {
        await ocultarModelo(modelo)
      }
    })
  }

  return (
    <>
      {/* Resumen */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 md:gap-6 text-sm">
        <div>
          <p className="text-xs text-gray-500">Modelos</p>
          <p className="font-bold text-gray-900">{visibles.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Compras</p>
          <p className="font-bold text-blue-700">{totalCompras}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Ventas</p>
          <p className="font-bold text-amber-700">{totalVentas}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Kits disponibles</p>
          <p className={`font-bold ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Stock celulares</p>
          <p className="font-bold text-purple-700">{totalStockCel}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Valuación</p>
          <p className="font-bold text-green-700">{formatearMoneda(totalValuacion)}</p>
        </div>
      </div>

      {/* Toggle ocultos */}
      {ocultosItems.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setMostrarOcultos(!mostrarOcultos)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              mostrarOcultos
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
            }`}
          >
            <EyeIcon open={!mostrarOcultos} />
            {mostrarOcultos ? `Ocultar ${ocultosItems.length} modelo${ocultosItems.length > 1 ? 's' : ''}` : `Mostrar ${ocultosItems.length} oculto${ocultosItems.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Tabla */}
      {displayItems.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Sin kits recibidos. Los pedidos de &quot;Kits de Seguridad&quot; marcados como recibidos aparecerán aquí.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-2 py-3"></th>
                <th className="text-right px-4 py-3 font-medium text-purple-700 bg-purple-50">Stock cel.</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Compras</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ventas</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Kits disp.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Precio unit.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Valuación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayItems.map((r) => {
                const hidden = esOculto(r.modelo)
                const faltanKits = r.stockCelulares > r.disponible
                return (
                  <tr
                    key={r.modelo}
                    className={`hover:bg-gray-50 ${hidden ? 'opacity-40' : r.disponible < 0 ? 'bg-red-50' : faltanKits ? 'bg-amber-50' : ''}`}
                  >
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => handleToggle(r.modelo)}
                        disabled={pending}
                        title={hidden ? 'Mostrar modelo' : 'Ocultar modelo'}
                        className="text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
                      >
                        <EyeIcon open={!hidden} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-purple-700 bg-purple-50/50">
                      {r.stockCelulares}
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">{r.modelo}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{r.compras}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{r.ventas}</td>
                    <td className={`px-4 py-3 text-right font-bold ${r.disponible < 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {r.disponible}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatearMoneda(r.precioUnitario)}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-medium">
                      {r.valuacion > 0 ? formatearMoneda(r.valuacion) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-semibold">
                <td className="px-2 py-3"></td>
                <td className="px-4 py-3 text-right text-purple-700 bg-purple-50/50">{totalStockCel}</td>
                <td className="px-5 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-blue-700">{totalCompras}</td>
                <td className="px-4 py-3 text-right text-amber-700">{totalVentas}</td>
                <td className={`px-4 py-3 text-right ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-right text-green-700">{formatearMoneda(totalValuacion)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        * &quot;Stock cel.&quot; muestra celulares disponibles en inventario GOcelular para cada modelo.
        Si el stock de celulares supera los kits disponibles, aparece REPONER.
      </p>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/inventario/kits-seguridad/KitsTable.tsx
git commit -m "feat: add KitsTable client component with hide/show model toggle"
```

---

### Task 5: Reescribir página admin kits-seguridad

**Files:**
- Modify: `app/(admin)/inventario/kits-seguridad/page.tsx` (reescritura completa)

- [ ] **Step 1: Reescribir la página**

La página server component ahora carga TODOS los items (sin filtrar ocultos) y la lista de ocultos, y pasa ambos al client component que se encarga del filtrado y cálculos.

```tsx
export const dynamic = 'force-dynamic'

import { getInventarioByCategoria } from '@/lib/actions/compras'
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'
import KitsTable from './KitsTable'

export default async function KitsSeguridadPage() {
  const [items, modelosOcultos] = await Promise.all([
    getInventarioByCategoria('Kits de Seguridad'),
    getModelosOcultos(),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Kits de Seguridad</h1>
      <p className="text-sm text-gray-500 mb-6">Inventario de kits recibidos vs ventas realizadas</p>

      <KitsTable items={items} modelosOcultos={modelosOcultos} />
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/inventario/kits-seguridad/page.tsx
git commit -m "feat: integrate KitsTable with hidden models support in admin page"
```

---

### Task 6: Filtrar ocultos en vista proveedor

**Files:**
- Modify: `app/proveedor/kits/page.tsx`

- [ ] **Step 1: Modificar la página**

Agregar import de `getModelosOcultos` y usarlo para filtrar los items y el desplegable de productos.

Cambios específicos:

1. Agregar import:
```typescript
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'
```

2. En el Promise.all, agregar la llamada:
```typescript
const [items, allProductos, modelosOcultos] = await Promise.all([
  getInventarioByCategoria('Kits de Seguridad'),
  getProductos(),
  getModelosOcultos(),
])
```

3. Después de la línea `const celulares = ...`, filtrar los items y productos:
```typescript
const ocultos = new Set(modelosOcultos.map(m => m.toLowerCase()))
const itemsFiltrados = items.filter(r => !ocultos.has(r.modelo.toLowerCase()))
const celularesFiltrados = celulares.filter(p => !ocultos.has(p.nombre.toLowerCase()))
```

4. Reemplazar todas las referencias a `items` por `itemsFiltrados` y `celulares` por `celularesFiltrados` en el cálculo de totales y en el JSX.

Los totales deben calcularse sobre `itemsFiltrados`:
```typescript
const totalCompras = itemsFiltrados.reduce((s, r) => s + r.compras, 0)
const totalVentas = itemsFiltrados.reduce((s, r) => s + r.ventas, 0)
const totalDisponible = itemsFiltrados.reduce((s, r) => s + r.disponible, 0)
const totalStockCel = itemsFiltrados.reduce((s, r) => s + r.stockCelulares, 0)
```

El `EntregaForm` recibe solo los productos filtrados:
```tsx
<EntregaForm
  token={searchParams.token!}
  productos={celularesFiltrados.map(p => ({ id: p.id, nombre: p.nombre, codigo: p.codigo }))}
/>
```

La tabla y el map de items usan `itemsFiltrados`.

- [ ] **Step 2: Verificar TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/proveedor/kits/page.tsx
git commit -m "feat: filter hidden models from provider kits view and delivery form"
```

---

### Task 7: Verificación final y deploy

- [ ] **Step 1: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 2: Deploy a producción**

Run: `npx vercel --prod --yes`

- [ ] **Step 3: Verificar en producción**

Admin: https://gocelular360.vercel.app/inventario/kits-seguridad
- Verificar que aparece el icono de ojo por fila
- Ocultar un modelo → desaparece de la tabla y los totales se recalculan
- Click "Mostrar ocultos" → aparece en gris con opacity baja
- Click ojo de nuevo → se reactiva

Proveedor: https://gocelular360.vercel.app/proveedor/kits?token=kits2026go
- Verificar que el modelo oculto no aparece en la tabla
- Verificar que el modelo oculto no aparece en el desplegable de entrega
- Verificar que los totales no incluyen el modelo oculto
