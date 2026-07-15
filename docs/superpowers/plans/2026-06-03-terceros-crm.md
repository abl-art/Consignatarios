# Venta a Terceros + CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva seccion "Venta a Terceros" con CRM Kanban para prospectos y pagina de Altas con metricas de venta.

**Architecture:** Server actions en `lib/actions/crm-terceros.ts` para CRUD de prospectos + creacion automatica de todos de seguimiento via `flujo_config`. Pagina CRM con componente cliente interactivo. Pagina Altas como server component que consulta GOcelular para metricas.

**Tech Stack:** Next.js server actions, Supabase (crm_prospectos), PostgreSQL (GOcelular para metricas), React

---

### Task 1: Server actions para CRM prospectos

**Files:**
- Create: `lib/actions/crm-terceros.ts`

- [ ] **Step 1: Crear el archivo con tipos e interfaces**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { diaHabilSiguiente } from '@/lib/utils'

export interface Prospecto {
  id: string
  nombre: string
  sucursales: number
  estado: 'prospecto' | 'propuesta' | 'ganado' | 'perdido'
  prospecto_at: string
  propuesta_at: string | null
  ganado_at: string | null
  perdido_at: string | null
  created_at: string
}

export interface ProspectoStats {
  estado: string
  count: number
  sucursales: number
  tiempoPromedio: number // dias
}
```

- [ ] **Step 2: Agregar fetchProspectos y fetchProspectoStats**

```typescript
export async function fetchProspectos(): Promise<Prospecto[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('crm_prospectos').select('*').order('created_at', { ascending: true })
  return (data ?? []) as Prospecto[]
}

export async function fetchProspectoStats(prospectos: Prospecto[]): Promise<ProspectoStats[]> {
  const estados = ['prospecto', 'propuesta', 'ganado', 'perdido'] as const
  const now = Date.now()

  return estados.map(estado => {
    const enEstado = prospectos.filter(p => p.estado === estado)
    const count = enEstado.length
    const sucursales = enEstado.reduce((s, p) => s + p.sucursales, 0)

    // Tiempo promedio: para todos los prospectos que pasaron o estan en este estado
    const tiempos: number[] = []
    for (const p of prospectos) {
      let entrada: string | null = null
      let salida: string | null = null

      if (estado === 'prospecto') {
        entrada = p.prospecto_at
        salida = p.propuesta_at ?? p.ganado_at ?? p.perdido_at
      } else if (estado === 'propuesta') {
        entrada = p.propuesta_at
        salida = p.ganado_at ?? p.perdido_at
      } else if (estado === 'ganado') {
        entrada = p.ganado_at
        salida = null // estado final
      } else if (estado === 'perdido') {
        entrada = p.perdido_at
        salida = null // estado final
      }

      if (!entrada) continue
      const fin = salida ? new Date(salida).getTime() : now
      tiempos.push((fin - new Date(entrada).getTime()) / (1000 * 60 * 60 * 24))
    }

    const tiempoPromedio = tiempos.length > 0
      ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length * 10) / 10
      : 0

    return { estado, count, sucursales, tiempoPromedio }
  })
}
```

- [ ] **Step 3: Agregar crearProspecto**

```typescript
export async function crearProspecto(nombre: string, sucursales: number): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  const { error } = await sb.from('crm_prospectos').insert({ nombre, sucursales })
  if (error) return { error: error.message }
  revalidatePath('/terceros/crm')
  return { ok: true }
}
```

- [ ] **Step 4: Agregar actualizarSucursales**

```typescript
export async function actualizarSucursales(id: string, sucursales: number): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  const { error } = await sb.from('crm_prospectos').update({ sucursales }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/terceros/crm')
  return { ok: true }
}
```

- [ ] **Step 5: Agregar moverProspecto con creacion automatica de seguimiento**

```typescript
async function crearSeguimiento(nombre: string) {
  const sb = createAdminClient()
  // Calcular fecha 7 dias habiles adelante
  const futuro = new Date()
  futuro.setDate(futuro.getDate() + 7)
  const fecha = diaHabilSiguiente(futuro.getFullYear(), futuro.getMonth(), futuro.getDate())

  // Leer todos existentes
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_todos').single()
  const todos: Record<string, { id: string; text: string; done: boolean; prioridad?: string }[]> = data?.value ? JSON.parse(data.value) : {}

  const items = todos[fecha] ?? []
  items.push({
    id: Date.now().toString(),
    text: `Seguimiento prospecto: ${nombre}`,
    done: false,
    prioridad: 'negrita',
  })
  todos[fecha] = items

  await sb.from('flujo_config').upsert({
    key: 'app_todos',
    value: JSON.stringify(todos),
    updated_at: new Date().toISOString(),
  })
}

export async function moverProspecto(id: string, nuevoEstado: 'prospecto' | 'propuesta' | 'ganado' | 'perdido'): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()

  // Fetch current prospecto
  const { data: prospecto } = await sb.from('crm_prospectos').select('*').eq('id', id).single()
  if (!prospecto) return { error: 'Prospecto no encontrado' }

  const update: Record<string, unknown> = { estado: nuevoEstado }
  const now = new Date().toISOString()

  if (nuevoEstado === 'propuesta') update.propuesta_at = now
  if (nuevoEstado === 'ganado') update.ganado_at = now
  if (nuevoEstado === 'perdido') update.perdido_at = now

  const { error } = await sb.from('crm_prospectos').update(update).eq('id', id)
  if (error) return { error: error.message }

  // Crear seguimiento automatico al mover a propuesta
  if (nuevoEstado === 'propuesta') {
    await crearSeguimiento(prospecto.nombre)
  }

  revalidatePath('/terceros/crm')
  return { ok: true }
}
```

- [ ] **Step 6: Agregar regenerarSeguimiento (para cuando se tacha un todo)**

```typescript
export async function regenerarSeguimiento(nombreProspecto: string): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  // Verificar que el prospecto siga en estado propuesta
  const { data } = await sb.from('crm_prospectos').select('estado').ilike('nombre', nombreProspecto).single()
  if (!data || data.estado !== 'propuesta') return { ok: true } // No regenerar si ya salio de propuesta
  await crearSeguimiento(nombreProspecto)
  return { ok: true }
}
```

- [ ] **Step 7: Agregar fetchTercerosAltas para la pagina Altas**

```typescript
import { getPool } from '@/lib/db-pool'
import { CLIENT_IDS_TERCEROS } from '@/lib/client-ids'

export interface TerceroAlta {
  clientId: string
  merchantName: string
  tiendas: number
  ventasCantidad: number
  ventasMonto: number
}

export async function fetchTercerosAltas(): Promise<TerceroAlta[]> {
  const pool = getPool()
  if (!pool) return []

  const ids = CLIENT_IDS_TERCEROS.filter(id => id !== '1').map(id => `'${id}'`).join(', ')

  try {
    const client = await pool.connect()
    try {
      const res = await client.query<{
        client_id: string
        merchant_name: string
        tiendas: string
        ventas_cantidad: string
        ventas_monto: string
      }>(`
        WITH tiendas AS (
          SELECT client_id,
            MIN(store_name) AS merchant_name,
            COUNT(DISTINCT store_name) AS tiendas
          FROM gocuotas_orders
          WHERE client_id IN (${ids})
          GROUP BY client_id
        ),
        ventas30 AS (
          SELECT client_id,
            COUNT(*)::text AS ventas_cantidad,
            COALESCE(SUM(total_order_amount), 0)::text AS ventas_monto
          FROM gocuotas_orders
          WHERE client_id IN (${ids})
            AND order_created_at >= now() - interval '30 days'
            AND order_discarded_at IS NULL
          GROUP BY client_id
        )
        SELECT t.client_id, t.merchant_name, t.tiendas::text,
          COALESCE(v.ventas_cantidad, '0') AS ventas_cantidad,
          COALESCE(v.ventas_monto, '0') AS ventas_monto
        FROM tiendas t
        LEFT JOIN ventas30 v ON v.client_id = t.client_id
        ORDER BY t.client_id
      `)

      return res.rows.map(r => {
        // Extraer nombre del merchant del primer store_name
        const name = r.merchant_name
        let merchantName = name
        if (name.includes('RIIING') || name.includes('RIIIING') || name.includes('RIING')) merchantName = 'RIIING'
        else if (name.includes('TECNO') || name.includes('COMPRO')) merchantName = 'TECNO-COMPRO'
        else if (name.includes('Plus Phone')) merchantName = 'Plus Phone'
        else if (name.includes('DIGGIT')) merchantName = 'DIGGIT'

        return {
          clientId: r.client_id,
          merchantName,
          tiendas: Number(r.tiendas),
          ventasCantidad: Number(r.ventas_cantidad),
          ventasMonto: Number(r.ventas_monto),
        }
      })
    } finally {
      client.release()
    }
  } catch (e) {
    console.error('Error fetching terceros altas:', e)
    return []
  }
}
```

- [ ] **Step 8: Verificar build**

Run: `npx next build`
Expected: Build succeeds

---

### Task 2: Pagina CRM con Kanban

**Files:**
- Create: `app/(admin)/terceros/crm/page.tsx`
- Create: `app/(admin)/terceros/crm/CRMClient.tsx`

- [ ] **Step 1: Crear page.tsx (server component)**

```typescript
import { fetchProspectos, fetchProspectoStats } from '@/lib/actions/crm-terceros'
import CRMClient from './CRMClient'

export default async function CRMPage() {
  const prospectos = await fetchProspectos()
  const stats = await fetchProspectoStats(prospectos)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">CRM - Venta a Terceros</h1>
      <p className="text-sm text-gray-500 mb-6">Pipeline de prospectos comerciales</p>
      <CRMClient prospectos={prospectos} stats={stats} />
    </div>
  )
}
```

- [ ] **Step 2: Crear CRMClient.tsx**

Create `app/(admin)/terceros/crm/CRMClient.tsx` with the full interactive Kanban component. This is a client component with:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { crearProspecto, moverProspecto, actualizarSucursales, type Prospecto, type ProspectoStats } from '@/lib/actions/crm-terceros'

interface Props {
  prospectos: Prospecto[]
  stats: ProspectoStats[]
}

const ESTADOS = [
  { key: 'prospecto', label: 'Prospecto', color: 'blue' },
  { key: 'propuesta', label: 'Propuesta y seguimiento', color: 'yellow' },
  { key: 'ganado', label: 'Ganado', color: 'green' },
  { key: 'perdido', label: 'Perdido', color: 'red' },
] as const

export default function CRMClient({ prospectos, stats }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [sucursales, setSucursales] = useState(1)
  const [creando, setCreando] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function handleCrear() {
    if (!nombre.trim()) return
    setCreando(true)
    await crearProspecto(nombre.trim(), sucursales)
    setNombre('')
    setSucursales(1)
    setShowForm(false)
    setCreando(false)
    router.refresh()
  }

  async function handleMover(id: string, estado: 'prospecto' | 'propuesta' | 'ganado' | 'perdido') {
    await moverProspecto(id, estado)
    router.refresh()
  }

  async function handleSucursales(id: string, value: number) {
    await actualizarSucursales(id, value)
    router.refresh()
  }

  const colorMap = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', header: 'bg-blue-100 text-blue-800', badge: 'bg-blue-600' },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', header: 'bg-amber-100 text-amber-800', badge: 'bg-amber-600' },
    green: { bg: 'bg-green-50', border: 'border-green-200', header: 'bg-green-100 text-green-800', badge: 'bg-green-600' },
    red: { bg: 'bg-red-50', border: 'border-red-200', header: 'bg-red-100 text-red-800', badge: 'bg-red-600' },
  }

  return (
    <>
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {ESTADOS.map(e => {
          const s = stats.find(st => st.estado === e.key)
          const colors = colorMap[e.color]
          return (
            <div key={e.key} className={`${colors.bg} border ${colors.border} rounded-xl p-4`}>
              <p className="text-xs text-gray-600 mb-1">{e.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-gray-900">{s?.count ?? 0}</p>
                <p className="text-xs text-gray-500">{s?.sucursales ?? 0} sucursales</p>
              </div>
              <p className="text-xs text-gray-400 mt-1">Promedio: {s?.tiempoPromedio ?? 0} dias</p>
            </div>
          )
        })}
      </div>

      {/* New prospecto button */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          className="mb-4 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">
          + Nuevo prospecto
        </button>
      ) : (
        <div className="mb-4 flex items-end gap-3 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex-1">
            <label className="text-xs text-gray-600">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Nombre del prospecto" />
          </div>
          <div className="w-28">
            <label className="text-xs text-gray-600">Sucursales</label>
            <input type="number" min={1} value={sucursales} onChange={e => setSucursales(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button onClick={handleCrear} disabled={creando}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {creando ? 'Creando...' : 'Crear'}
          </button>
          <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
        </div>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {ESTADOS.map(e => {
          const colors = colorMap[e.color]
          const items = prospectos.filter(p => p.estado === e.key)
          return (
            <div key={e.key} className="min-h-[200px]">
              <div className={`${colors.header} rounded-t-xl px-4 py-2 text-sm font-semibold flex justify-between`}>
                <span>{e.label}</span>
                <span className={`${colors.badge} text-white text-xs px-2 py-0.5 rounded-full`}>{items.length}</span>
              </div>
              <div className={`${colors.bg} border ${colors.border} border-t-0 rounded-b-xl p-2 space-y-2`}>
                {items.map(p => {
                  const entradaAt = e.key === 'prospecto' ? p.prospecto_at
                    : e.key === 'propuesta' ? p.propuesta_at
                    : e.key === 'ganado' ? p.ganado_at
                    : p.perdido_at
                  const dias = entradaAt ? Math.round((Date.now() - new Date(entradaAt).getTime()) / 86400000) : 0

                  return (
                    <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                      <p className="font-semibold text-sm text-gray-900">{p.nombre}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <input type="number" min={0} value={p.sucursales}
                          onChange={e => handleSucursales(p.id, Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                          className="w-16 px-2 py-0.5 border border-gray-200 rounded text-xs text-center" />
                        <span className="text-xs text-gray-400">sucursales</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">hace {dias} dias</p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {e.key !== 'prospecto' && (
                          <button onClick={() => handleMover(p.id, 'prospecto')}
                            className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Prospecto</button>
                        )}
                        {e.key !== 'propuesta' && e.key !== 'ganado' && e.key !== 'perdido' && (
                          <button onClick={() => handleMover(p.id, 'propuesta')}
                            className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded hover:bg-amber-200">Propuesta</button>
                        )}
                        {e.key === 'propuesta' && (
                          <>
                            <button onClick={() => handleMover(p.id, 'ganado')}
                              className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200">Ganado</button>
                            <button onClick={() => handleMover(p.id, 'perdido')}
                              className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">Perdido</button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Verificar build**

Run: `npx next build`
Expected: Build succeeds

---

### Task 3: Pagina Altas

**Files:**
- Create: `app/(admin)/terceros/altas/page.tsx`

- [ ] **Step 1: Crear page.tsx**

```typescript
import { formatearMoneda } from '@/lib/utils'
import { fetchTercerosAltas } from '@/lib/actions/crm-terceros'
import Link from 'next/link'

export default async function AltasPage() {
  const terceros = await fetchTercerosAltas()

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Altas - Terceros Activos</h1>
      <p className="text-sm text-gray-500 mb-6">Merchants dados de alta en GOcelular</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {terceros.map(t => (
          <div key={t.clientId} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold text-gray-900">{t.merchantName}</h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">ID: {t.clientId}</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Tiendas</span>
                <span className="font-semibold text-gray-900">{t.tiendas}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ventas (30 dias)</span>
                <span className="font-semibold text-blue-600">{t.ventasCantidad}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Monto (30 dias)</span>
                <span className="font-semibold text-green-700">{formatearMoneda(t.ventasMonto)}</span>
              </div>
            </div>
            <Link href={`/dashboard/terceros?merchant=${t.merchantName}`}
              className="mt-4 block text-center text-xs text-blue-600 hover:text-blue-800 font-medium">
              Ver dashboard →
            </Link>
          </div>
        ))}
      </div>

      {terceros.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No hay terceros activos.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `npx next build`
Expected: Build succeeds

---

### Task 4: Agregar seccion al sidebar + hook seguimiento

**Files:**
- Modify: `app/(admin)/layout.tsx`
- Modify: `app/(admin)/notas/actions.ts`

- [ ] **Step 1: Agregar "Venta a Terceros" al nav**

In `app/(admin)/layout.tsx`, in the `navItems` array, add after the Consignatarios section (after line 55, before the Finanzas line):

```typescript
  {
    href: '/terceros',
    label: 'Venta a Terceros',
    icon: 'ventas',
    children: [
      { href: '/terceros/crm', label: 'CRM', icon: 'consignatarios' },
      { href: '/terceros/altas', label: 'Altas', icon: 'tienda' },
    ],
  },
```

- [ ] **Step 2: Agregar regeneracion automatica de seguimiento en notas/actions.ts**

In `app/(admin)/notas/actions.ts`, add the import and modify `guardarTodos` to detect completed seguimiento items:

Add at the top:
```typescript
import { regenerarSeguimiento } from '@/lib/actions/crm-terceros'
```

Add at the end of the file:
```typescript
export async function completarTodoConSeguimiento(fecha: string, todoId: string): Promise<SaveResult> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_todos').single()
  const todos: Record<string, { id: string; text: string; done: boolean; prioridad?: string }[]> = data?.value ? JSON.parse(data.value) : {}

  const items = todos[fecha] ?? []
  const item = items.find(t => t.id === todoId)
  if (!item) return { ok: false, error: 'Todo no encontrado' }

  // Toggle done
  item.done = !item.done

  // Si se completa y es un seguimiento de prospecto, regenerar
  if (item.done && item.text.startsWith('Seguimiento prospecto: ')) {
    const nombre = item.text.replace('Seguimiento prospecto: ', '')
    await regenerarSeguimiento(nombre)
  }

  todos[fecha] = items
  return upsertConfig('app_todos', JSON.stringify(todos))
}
```

Note: `upsertConfig` is already defined as a private function in this file. The new export can call it directly.

- [ ] **Step 3: Verificar build**

Run: `npx next build`
Expected: Build succeeds

---

### Task 5: Build y deploy

- [ ] **Step 1: Build final**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 2: Deploy**

Run: `npx vercel --prod --yes`
Expected: Deployment successful

- [ ] **Step 3: Verificar**

1. Sidebar: "Venta a Terceros" con CRM y Altas
2. CRM: Crear prospecto, mover a propuesta → verificar que se crea todo en Notas
3. Altas: Cards de RIIING, TECNO-COMPRO, Plus Phone con metricas
