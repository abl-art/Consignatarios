# Inventario Accesorios — Rediseño Smartwatches, Parlantes, Auriculares

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar las 3 páginas de inventario de accesorios (smartwatches, parlantes, auriculares) con 5 tarjetas KPI, gráfico de líneas con filtros de agrupación, y sistema de cierre mensual de stock para contabilidad.

**Architecture:** Cada página server-component consulta GOcelulares (store_products para stock, store_order_items + gocuotas_orders para ventas por período). Un componente client compartido `AccesoriosVentasChart` renderiza el gráfico de líneas con Recharts. Una tabla Supabase `stock_cierre_mensual` almacena la existencia final de cada mes, alimentada por un cron de Vercel que corre el último día de cada mes a las 23:59 UTC-3.

**Tech Stack:** Next.js 14 (App Router, server components), Recharts (LineChart), Supabase (tabla cierre), pg Pool (GOcelulares), Vercel Cron.

---

## File Structure

| Action | Path | Responsabilidad |
|--------|------|-----------------|
| Create | `lib/actions/accesorios-ventas.ts` | Queries compartidas: stock desde store_products, ventas por período con desglose diario |
| Create | `components/inventario/AccesoriosVentasChart.tsx` | Client component: gráfico de líneas con filtros Totales/Diarias/Semanales/Mensuales y toggle Cantidad/Pesos |
| Create | `components/inventario/ExistenciasMensuales.tsx` | Client component: tabla de existencias finales mensuales desde Supabase |
| Modify | `app/(admin)/inventario/smartwatches/page.tsx` | Reescribir con 5 tarjetas + chart + existencias |
| Modify | `app/(admin)/inventario/parlantes/page.tsx` | Reescribir con 5 tarjetas + chart + existencias |
| Modify | `app/(admin)/inventario/auriculares/page.tsx` | Reescribir con 5 tarjetas + chart + existencias |
| Create | `supabase/migrations/20260528_create_stock_cierre_mensual.sql` | Tabla para cierre mensual |
| Create | `app/api/cron/stock-cierre/route.ts` | Cron endpoint que graba el stock al cierre de mes |
| Modify | `vercel.json` | Agregar cron de cierre mensual |

---

### Task 1: Crear tabla Supabase `stock_cierre_mensual`

**Files:**
- Create: `supabase/migrations/20260528_create_stock_cierre_mensual.sql`

- [ ] **Step 1: Crear la migración SQL**

```sql
-- Existencia final mensual de accesorios (store_products de GOcelulares)
CREATE TABLE IF NOT EXISTS stock_cierre_mensual (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  periodo text NOT NULL,            -- 'YYYY-MM' ej: '2026-05'
  categoria text NOT NULL,          -- 'smartwatches' | 'parlantes' | 'auriculares'
  producto text NOT NULL,           -- nombre unificado del producto
  stock_final int NOT NULL,         -- unidades disponibles al cierre
  precio_unitario numeric NOT NULL, -- precio unitario al momento del cierre
  valuacion numeric NOT NULL,       -- stock_final * precio_unitario
  created_at timestamptz DEFAULT now(),
  UNIQUE(periodo, categoria)
);

-- Index para consultas rápidas por categoría
CREATE INDEX idx_stock_cierre_categoria ON stock_cierre_mensual(categoria, periodo);
```

Escribir este contenido en `supabase/migrations/20260528_create_stock_cierre_mensual.sql`.

- [ ] **Step 2: Aplicar la migración en Supabase**

Ejecutar en el SQL Editor de Supabase (https://supabase.com/dashboard/project/rnjxmmcsxmyaktseegvt/sql) el contenido del archivo de migración.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528_create_stock_cierre_mensual.sql
git commit -m "feat: create stock_cierre_mensual table for monthly closing stock"
```

---

### Task 2: Crear `lib/actions/accesorios-ventas.ts` — queries compartidas

**Files:**
- Create: `lib/actions/accesorios-ventas.ts`

Este archivo centraliza las queries que las 3 páginas comparten. Cada página solo pasa su configuración (nombres, keywords) y recibe los datos listos.

- [ ] **Step 1: Crear el archivo con las queries**

```typescript
import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Configuración por categoría
// ---------------------------------------------------------------------------

export interface CategoriaConfig {
  categoria: 'smartwatches' | 'parlantes' | 'auriculares'
  nombreUnificado: string
  variants: string[]      // nombres en store_order_items (lowercase)
  keywords: string[]      // para filtrar store_products
}

export const SMARTWATCHES_CONFIG: CategoriaConfig = {
  categoria: 'smartwatches',
  nombreUnificado: 'Pulsera Inteligente Xiaomi 9 Active',
  variants: [
    'pulsera inteligente xiaomi 9 active',
    'xiaomi smart band 9 active',
    'xiaomi samrt band 9 active',
    'mi band 9 active',
    'smart band 9 active',
  ],
  keywords: ['pulsera', 'band', 'watch', 'smartwatch', 'reloj'],
}

export const PARLANTES_CONFIG: CategoriaConfig = {
  categoria: 'parlantes',
  nombreUnificado: 'Parlante Xiaomi 2 Bluetooth',
  variants: [
    'parlante xiaomi 2 bluetooth',
    'xiaomi speaker 2 bluetooth',
    'mi speaker 2 bluetooth',
    'parlante bluetooth mi compact speaker 2',
  ],
  keywords: ['speaker', 'parlante', 'bocina', 'altavoz'],
}

export const AURICULARES_CONFIG: CategoriaConfig = {
  categoria: 'auriculares',
  nombreUnificado: 'Auriculares Redmi Buds 6 Play',
  variants: [
    'auriculares redmi buds 6 play',
    'redmi buds 6 play',
  ],
  keywords: ['buds', 'auricular', 'earphone', 'headphone', 'earbuds'],
}

// ---------------------------------------------------------------------------
// Tipos de respuesta
// ---------------------------------------------------------------------------

export interface AccesorioKPIs {
  stockDisponible: number   // directo de store_products (GOcelulares)
  precioUnitario: number    // precio del producto en store_products
  valuacion: number         // stock * precio
  ventasMes: number         // ventas del mes en curso
  ventasSemana: number      // ventas últimos 7 días
  ventasAyer: number        // ventas de ayer
}

export interface VentaDiaria {
  fecha: string   // YYYY-MM-DD
  cantidad: number
  monto: number
}

export interface StockCierreMensual {
  periodo: string
  stockFinal: number
  precioUnitario: number
  valuacion: number
}

// ---------------------------------------------------------------------------
// Query: KPIs + ventas diarias
// ---------------------------------------------------------------------------

export async function fetchAccesorioData(config: CategoriaConfig): Promise<{
  kpis: AccesorioKPIs
  ventasDiarias: VentaDiaria[]
  cierres: StockCierreMensual[]
  error: string | null
}> {
  const pool = getPool()
  if (!pool) return {
    kpis: { stockDisponible: 0, precioUnitario: 0, valuacion: 0, ventasMes: 0, ventasSemana: 0, ventasAyer: 0 },
    ventasDiarias: [],
    cierres: [],
    error: 'GOCELULAR_DB_URL no configurada',
  }

  const client = await pool.connect()
  try {
    // 1. Stock disponible directo de store_products (fuente de verdad GOcelulares)
    const stockRes = await client.query<{ display_name: string; stock: string; price: string }>(
      `SELECT display_name, COALESCE(stock, 0)::text AS stock, price
       FROM store_products
       WHERE is_addon = true AND status = 'active' AND display_name NOT ILIKE '%E2E%'`
    )
    const matchKeyword = (name: string) => {
      const lower = name.toLowerCase()
      return config.keywords.some(k => lower.includes(k))
    }
    const items = stockRes.rows.filter(r => matchKeyword(r.display_name))
    let stockDisponible = 0
    let precioUnitario = 0
    for (const r of items) {
      stockDisponible += Number(r.stock)
      if (Number(r.price) > 0) precioUnitario = Number(r.price) / 100
    }

    // 2. Ventas diarias desglosadas (todas las fechas)
    const ventasRes = await client.query<{ fecha: string; cantidad: string; monto: string }>(
      `SELECT so.created_at::date::text AS fecha,
              COALESCE(SUM(soi.quantity), 0)::text AS cantidad,
              COALESCE(SUM(
                CASE WHEN go.total_order_amount > 5000000
                     THEN go.total_order_amount / 100.0
                     ELSE go.total_order_amount END
              ), 0)::text AS monto
       FROM store_order_items soi
       JOIN store_orders so ON so.id = soi.order_id
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       WHERE go.order_status = 'approved'
         AND go.order_discarded_at IS NULL
         AND LOWER(soi.display_name) = ANY($1)
       GROUP BY 1
       ORDER BY 1`,
      [config.variants]
    )

    const ventasDiarias: VentaDiaria[] = ventasRes.rows.map(r => ({
      fecha: r.fecha,
      cantidad: Number(r.cantidad),
      monto: Number(r.monto),
    }))

    // 3. Calcular KPIs de período
    const hoy = new Date()
    const ayer = new Date(hoy)
    ayer.setDate(ayer.getDate() - 1)
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 7)
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

    const ayerStr = ayer.toISOString().slice(0, 10)
    const hace7Str = hace7.toISOString().slice(0, 10)
    const inicioMesStr = inicioMes.toISOString().slice(0, 10)

    let ventasAyer = 0, ventasSemana = 0, ventasMes = 0
    for (const v of ventasDiarias) {
      if (v.fecha === ayerStr) ventasAyer += v.cantidad
      if (v.fecha >= hace7Str) ventasSemana += v.cantidad
      if (v.fecha >= inicioMesStr) ventasMes += v.cantidad
    }

    // 4. Cierres mensuales desde Supabase
    const admin = createAdminClient()
    const { data: cierresData } = await admin
      .from('stock_cierre_mensual')
      .select('periodo, stock_final, precio_unitario, valuacion')
      .eq('categoria', config.categoria)
      .order('periodo', { ascending: false })

    const cierres: StockCierreMensual[] = (cierresData ?? []).map(r => ({
      periodo: r.periodo,
      stockFinal: r.stock_final,
      precioUnitario: r.precio_unitario,
      valuacion: r.valuacion,
    }))

    return {
      kpis: {
        stockDisponible,
        precioUnitario,
        valuacion: stockDisponible * precioUnitario,
        ventasMes,
        ventasSemana,
        ventasAyer,
      },
      ventasDiarias,
      cierres,
      error: null,
    }
  } catch (e: unknown) {
    return {
      kpis: { stockDisponible: 0, precioUnitario: 0, valuacion: 0, ventasMes: 0, ventasSemana: 0, ventasAyer: 0 },
      ventasDiarias: [],
      cierres: [],
      error: e instanceof Error ? e.message : String(e),
    }
  } finally {
    client.release()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/accesorios-ventas.ts
git commit -m "feat: add shared queries for accesorios inventory pages"
```

---

### Task 3: Crear componente `AccesoriosVentasChart`

**Files:**
- Create: `components/inventario/AccesoriosVentasChart.tsx`

Gráfico de líneas con filtros de agrupación (Totales, Diarias, Semanales, Mensuales) y toggle Cantidad/Pesos. Sigue el patrón exacto de `VentasHistoricasChart.tsx`.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface VentaDiaria {
  fecha: string // YYYY-MM-DD
  cantidad: number
  monto: number
}

type Agrupacion = 'diaria' | 'semanal' | 'mensual' | 'total'
type Metrica = 'cantidad' | 'pesos'

interface Props {
  data: VentaDiaria[]
  producto: string
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
        active
          ? 'bg-[#E91E7B] text-white border-[#E91E7B]'
          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
      }`}
    >
      {label}
    </button>
  )
}

const fmtNumber = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function abbreviate(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

// Obtener el lunes de la semana ISO para una fecha dada
function getISOWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toISOString().slice(0, 10)
}

function formatDay(yyyyMmDd: string): string {
  const [, month, day] = yyyyMmDd.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`
}

function formatWeek(mondayStr: string): string {
  const [, month, day] = mondayStr.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `Sem ${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`
}

export default function AccesoriosVentasChart({ data, producto }: Props) {
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('mensual')
  const [metrica, setMetrica] = useState<Metrica>('cantidad')

  const chartData = useMemo(() => {
    if (agrupacion === 'total') {
      const total = data.reduce((acc, v) => {
        acc.cantidad += v.cantidad
        acc.monto += v.monto
        return acc
      }, { cantidad: 0, monto: 0 })
      return [{ label: 'Total', valor: metrica === 'pesos' ? total.monto : total.cantidad }]
    }

    const groups = new Map<string, { cantidad: number; monto: number }>()

    for (const row of data) {
      let key: string
      if (agrupacion === 'diaria') {
        key = row.fecha
      } else if (agrupacion === 'semanal') {
        key = getISOWeekMonday(row.fecha)
      } else {
        key = row.fecha.slice(0, 7)
      }
      const existing = groups.get(key) ?? { cantidad: 0, monto: 0 }
      existing.cantidad += row.cantidad
      existing.monto += row.monto
      groups.set(key, existing)
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, vals]) => ({
        label: agrupacion === 'diaria' ? formatDay(key)
          : agrupacion === 'semanal' ? formatWeek(key)
          : formatMonth(key),
        valor: metrica === 'pesos' ? vals.monto : vals.cantidad,
      }))
  }, [data, agrupacion, metrica])

  const formatYAxis = (n: number) => {
    if (metrica === 'pesos') return `$${fmtNumber.format(n)}`
    return fmtNumber.format(n)
  }

  const formatTooltipValue = (value: number) => {
    if (metrica === 'pesos') return [`$${fmtNumber.format(value)}`, 'Monto']
    return [fmtNumber.format(value), 'Cantidad']
  }

  const formatLabel = (value: number) => {
    if (metrica === 'pesos') return `$${abbreviate(value)}`
    return abbreviate(value)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Ventas — {producto}</h3>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-1">
          <Pill label="Totales" active={agrupacion === 'total'} onClick={() => setAgrupacion('total')} />
          <Pill label="Diarias" active={agrupacion === 'diaria'} onClick={() => setAgrupacion('diaria')} />
          <Pill label="Semanales" active={agrupacion === 'semanal'} onClick={() => setAgrupacion('semanal')} />
          <Pill label="Mensuales" active={agrupacion === 'mensual'} onClick={() => setAgrupacion('mensual')} />
        </div>

        <div className="flex items-center gap-1">
          <Pill label="Cantidad" active={metrica === 'cantidad'} onClick={() => setMetrica('cantidad')} />
          <Pill label="Pesos" active={metrica === 'pesos'} onClick={() => setMetrica('pesos')} />
        </div>
      </div>

      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} tickFormatter={formatYAxis} />
            <Tooltip
              formatter={(value) => formatTooltipValue(Number(value))}
              labelStyle={{ color: '#374151' }}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="valor"
              stroke="#E91E7B"
              strokeWidth={2}
              dot={{ r: 4, fill: '#E91E7B' }}
              label={((props: any) => (
                <text x={props.x} y={props.y - 10} textAnchor="middle" fill="#6b7280" fontSize={9}>
                  {formatLabel(props.value)}
                </text>
              )) as any}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/inventario/AccesoriosVentasChart.tsx
git commit -m "feat: add AccesoriosVentasChart line chart component"
```

---

### Task 4: Crear componente `ExistenciasMensuales`

**Files:**
- Create: `components/inventario/ExistenciasMensuales.tsx`

Tabla que muestra las existencias finales mensuales desde Supabase para contabilidad.

- [ ] **Step 1: Crear el componente**

```tsx
'use client'

import { formatearMoneda } from '@/lib/utils'

interface Cierre {
  periodo: string
  stockFinal: number
  precioUnitario: number
  valuacion: number
}

interface Props {
  cierres: Cierre[]
  categoria: string
}

function formatPeriodo(periodo: string): string {
  const [year, month] = periodo.split('-')
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`
}

export default function ExistenciasMensuales({ cierres, categoria }: Props) {
  if (cierres.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Existencia Final Mensual</h3>
        <p className="text-xs text-gray-400">Aún no hay cierres registrados para {categoria}. Se generan automáticamente el último día de cada mes.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Existencia Final Mensual</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gray-600">Período</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Stock Final</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Precio Unit.</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Valuación</th>
            </tr>
          </thead>
          <tbody>
            {cierres.map((c) => (
              <tr key={c.periodo} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{formatPeriodo(c.periodo)}</td>
                <td className="px-4 py-2 text-right text-blue-600 font-bold">{c.stockFinal}</td>
                <td className="px-4 py-2 text-right text-gray-600">{formatearMoneda(c.precioUnitario)}</td>
                <td className="px-4 py-2 text-right text-gray-900 font-semibold">{formatearMoneda(c.valuacion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/inventario/ExistenciasMensuales.tsx
git commit -m "feat: add ExistenciasMensuales table component"
```

---

### Task 5: Reescribir página Smartwatches

**Files:**
- Modify: `app/(admin)/inventario/smartwatches/page.tsx` (reescritura completa)

- [ ] **Step 1: Reescribir la página**

```tsx
export const dynamic = 'force-dynamic'

import { formatearMoneda } from '@/lib/utils'
import { fetchAccesorioData, SMARTWATCHES_CONFIG } from '@/lib/actions/accesorios-ventas'
import AccesoriosVentasChart from '@/components/inventario/AccesoriosVentasChart'
import ExistenciasMensuales from '@/components/inventario/ExistenciasMensuales'

export default async function SmartwatchesPage() {
  const { kpis, ventasDiarias, cierres, error } = await fetchAccesorioData(SMARTWATCHES_CONFIG)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Smartwatches</h1>
      <p className="text-sm text-gray-500 mb-6">
        Stock disponible sincronizado con GOcelulares.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          No se pudo consultar GOcelular: {error}
        </div>
      )}

      {!error && (
        <>
          {/* 5 tarjetas KPI */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Stock Disponible</p>
              <p className="text-2xl font-bold text-blue-600">{kpis.stockDisponible}</p>
              <p className="text-xs text-gray-400">en GOcelulares</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Venta Mensual</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasMes}</p>
              <p className="text-xs text-gray-400">mes en curso</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Últimos 7 días</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasSemana}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Ventas Ayer</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasAyer}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Valuación Stock</p>
              <p className="text-2xl font-bold text-gray-900">{formatearMoneda(kpis.valuacion)}</p>
              <p className="text-xs text-gray-400">{kpis.stockDisponible} × {formatearMoneda(kpis.precioUnitario)}</p>
            </div>
          </div>

          {/* Gráfico de ventas */}
          <div className="mb-6">
            <AccesoriosVentasChart data={ventasDiarias} producto={SMARTWATCHES_CONFIG.nombreUnificado} />
          </div>

          {/* Existencias mensuales */}
          <ExistenciasMensuales cierres={cierres} categoria="smartwatches" />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: sin errores en smartwatches/page.tsx

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/inventario/smartwatches/page.tsx
git commit -m "feat: redesign smartwatches page with 5 KPI cards, chart, and monthly closing"
```

---

### Task 6: Reescribir página Parlantes

**Files:**
- Modify: `app/(admin)/inventario/parlantes/page.tsx` (reescritura completa)

- [ ] **Step 1: Reescribir la página**

Mismo layout que smartwatches, cambiando config a `PARLANTES_CONFIG`:

```tsx
export const dynamic = 'force-dynamic'

import { formatearMoneda } from '@/lib/utils'
import { fetchAccesorioData, PARLANTES_CONFIG } from '@/lib/actions/accesorios-ventas'
import AccesoriosVentasChart from '@/components/inventario/AccesoriosVentasChart'
import ExistenciasMensuales from '@/components/inventario/ExistenciasMensuales'

export default async function ParlantesPage() {
  const { kpis, ventasDiarias, cierres, error } = await fetchAccesorioData(PARLANTES_CONFIG)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Parlantes</h1>
      <p className="text-sm text-gray-500 mb-6">
        Stock disponible sincronizado con GOcelulares.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          No se pudo consultar GOcelular: {error}
        </div>
      )}

      {!error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Stock Disponible</p>
              <p className="text-2xl font-bold text-blue-600">{kpis.stockDisponible}</p>
              <p className="text-xs text-gray-400">en GOcelulares</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Venta Mensual</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasMes}</p>
              <p className="text-xs text-gray-400">mes en curso</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Últimos 7 días</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasSemana}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Ventas Ayer</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasAyer}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Valuación Stock</p>
              <p className="text-2xl font-bold text-gray-900">{formatearMoneda(kpis.valuacion)}</p>
              <p className="text-xs text-gray-400">{kpis.stockDisponible} × {formatearMoneda(kpis.precioUnitario)}</p>
            </div>
          </div>

          <div className="mb-6">
            <AccesoriosVentasChart data={ventasDiarias} producto={PARLANTES_CONFIG.nombreUnificado} />
          </div>

          <ExistenciasMensuales cierres={cierres} categoria="parlantes" />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/inventario/parlantes/page.tsx
git commit -m "feat: redesign parlantes page with 5 KPI cards, chart, and monthly closing"
```

---

### Task 7: Reescribir página Auriculares

**Files:**
- Modify: `app/(admin)/inventario/auriculares/page.tsx` (reescritura completa)

- [ ] **Step 1: Reescribir la página**

```tsx
export const dynamic = 'force-dynamic'

import { formatearMoneda } from '@/lib/utils'
import { fetchAccesorioData, AURICULARES_CONFIG } from '@/lib/actions/accesorios-ventas'
import AccesoriosVentasChart from '@/components/inventario/AccesoriosVentasChart'
import ExistenciasMensuales from '@/components/inventario/ExistenciasMensuales'

export default async function AuricularesPage() {
  const { kpis, ventasDiarias, cierres, error } = await fetchAccesorioData(AURICULARES_CONFIG)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Auriculares</h1>
      <p className="text-sm text-gray-500 mb-6">
        Stock disponible sincronizado con GOcelulares.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          No se pudo consultar GOcelular: {error}
        </div>
      )}

      {!error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Stock Disponible</p>
              <p className="text-2xl font-bold text-blue-600">{kpis.stockDisponible}</p>
              <p className="text-xs text-gray-400">en GOcelulares</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Venta Mensual</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasMes}</p>
              <p className="text-xs text-gray-400">mes en curso</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Últimos 7 días</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasSemana}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Ventas Ayer</p>
              <p className="text-2xl font-bold text-emerald-600">{kpis.ventasAyer}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Valuación Stock</p>
              <p className="text-2xl font-bold text-gray-900">{formatearMoneda(kpis.valuacion)}</p>
              <p className="text-xs text-gray-400">{kpis.stockDisponible} × {formatearMoneda(kpis.precioUnitario)}</p>
            </div>
          </div>

          <div className="mb-6">
            <AccesoriosVentasChart data={ventasDiarias} producto={AURICULARES_CONFIG.nombreUnificado} />
          </div>

          <ExistenciasMensuales cierres={cierres} categoria="auriculares" />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/inventario/auriculares/page.tsx
git commit -m "feat: redesign auriculares page with 5 KPI cards, chart, and monthly closing"
```

---

### Task 8: Crear cron de cierre mensual de stock

**Files:**
- Create: `app/api/cron/stock-cierre/route.ts`
- Modify: `vercel.json`

El cron corre a las 23:59 del último día de cada mes (hora Argentina UTC-3 = 02:59 UTC del día 1).

- [ ] **Step 1: Crear el endpoint cron**

```typescript
import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SMARTWATCHES_CONFIG,
  PARLANTES_CONFIG,
  AURICULARES_CONFIG,
  type CategoriaConfig,
} from '@/lib/actions/accesorios-ventas'

export const dynamic = 'force-dynamic'

const CONFIGS = [SMARTWATCHES_CONFIG, PARLANTES_CONFIG, AURICULARES_CONFIG]

async function getStockForConfig(config: CategoriaConfig): Promise<{
  stock: number
  precio: number
}> {
  const pool = getPool()
  if (!pool) return { stock: 0, precio: 0 }

  const client = await pool.connect()
  try {
    const res = await client.query<{ display_name: string; stock: string; price: string }>(
      `SELECT display_name, COALESCE(stock, 0)::text AS stock, price
       FROM store_products
       WHERE is_addon = true AND status = 'active' AND display_name NOT ILIKE '%E2E%'`
    )
    const matchKeyword = (name: string) => {
      const lower = name.toLowerCase()
      return config.keywords.some(k => lower.includes(k))
    }
    const items = res.rows.filter(r => matchKeyword(r.display_name))
    let stock = 0
    let precio = 0
    for (const r of items) {
      stock += Number(r.stock)
      if (Number(r.price) > 0) precio = Number(r.price) / 100
    }
    return { stock, precio }
  } finally {
    client.release()
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Período = mes anterior (el cron corre el día 1 a las 02:59 UTC = 23:59 AR del último día)
  const now = new Date()
  const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const periodo = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`

  const admin = createAdminClient()
  const results: string[] = []

  for (const config of CONFIGS) {
    // Verificar si ya existe cierre para este período y categoría
    const { data: existing } = await admin
      .from('stock_cierre_mensual')
      .select('id')
      .eq('periodo', periodo)
      .eq('categoria', config.categoria)
      .single()

    if (existing) {
      results.push(`${config.categoria}: ya existe cierre para ${periodo}`)
      continue
    }

    const { stock, precio } = await getStockForConfig(config)

    const { error } = await admin.from('stock_cierre_mensual').insert({
      periodo,
      categoria: config.categoria,
      producto: config.nombreUnificado,
      stock_final: stock,
      precio_unitario: precio,
      valuacion: stock * precio,
    })

    if (error) {
      results.push(`${config.categoria}: ERROR ${error.message}`)
    } else {
      results.push(`${config.categoria}: stock=${stock}, precio=${precio}, valuacion=${stock * precio}`)
    }
  }

  return NextResponse.json({ periodo, results })
}
```

- [ ] **Step 2: Agregar el cron a vercel.json**

Agregar al array `crons` en `vercel.json`:

```json
{
  "path": "/api/cron/stock-cierre",
  "schedule": "59 2 1 * *"
}
```

Esto es 02:59 UTC del día 1 de cada mes = 23:59 Argentina del último día del mes anterior.

- [ ] **Step 3: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/stock-cierre/route.ts vercel.json
git commit -m "feat: add monthly stock closing cron job for accesorios"
```

---

### Task 9: Verificación final y deploy

- [ ] **Step 1: Verificar TypeScript completo**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 2: Deploy a producción**

Run: `npx vercel --prod --yes`
Expected: deploy exitoso

- [ ] **Step 3: Verificar las 3 páginas en producción**

Abrir en el navegador:
- https://gocelular360.vercel.app/inventario/smartwatches
- https://gocelular360.vercel.app/inventario/parlantes
- https://gocelular360.vercel.app/inventario/auriculares

Verificar:
- Las 5 tarjetas se muestran con datos
- El stock disponible coincide con GOcelulares
- El gráfico de líneas funciona con los 4 filtros de agrupación
- El toggle Cantidad/Pesos cambia la métrica
- La sección de existencias mensuales aparece (vacía al principio, se llena el 1ro de cada mes)
