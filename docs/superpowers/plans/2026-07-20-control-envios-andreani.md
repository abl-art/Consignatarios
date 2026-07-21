# Control de Facturación de Envíos (Andreani) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admin to upload Andreani CSV invoices and cross-reference each shipment against GOcelular's `shipments` table to detect overcharges, persisting results in Supabase for historical tracking.

**Architecture:** New page at `/compras/envios` with client-side CSV parsing (papaparse, already installed), a server action that queries GOcelular's `shipments` table to validate tracking numbers, and two new Supabase tables (`facturas_envios` + `facturas_envios_detalle`) to persist each invoice and its line items with conciliation status. The Compras hub gets a 4th card linking to this page.

**Tech Stack:** Next.js 14 App Router, Supabase (local DB for persistence), GOcelular DB (read-only via pg Pool for tracking validation), papaparse (CSV parsing), Tailwind CSS.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/facturas_envios.sql` | New tables: `facturas_envios`, `facturas_envios_detalle` |
| `lib/types.ts` | New types: `FacturaEnvio`, `FacturaEnvioDetalle`, enums |
| `lib/actions/envios.ts` | Server actions: save invoice, conciliate against GOcelular, delete invoice |
| `app/(admin)/compras/envios/page.tsx` | Main page: list of uploaded invoices + upload form |
| `app/(admin)/compras/envios/EnviosClient.tsx` | Client component: CSV upload, parsing, preview, submit |
| `app/(admin)/compras/envios/[id]/page.tsx` | Invoice detail: summary cards + detail table with filters |
| `app/(admin)/compras/page.tsx` | Add 4th card "Envíos" to the Compras hub |

---

### Task 1: Create Supabase tables

**Files:**
- Create: `supabase/migrations/facturas_envios.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- FACTURAS ENVÍOS (Andreani)
-- ============================================================
create table facturas_envios (
  id uuid primary key default uuid_generate_v4(),
  nro_legal text not null unique,
  fecha_comprobante date not null,
  fecha_desde date not null,
  fecha_hasta date not null,
  total_envios integer not null default 0,
  total_facturado numeric not null default 0,
  envios_conciliados integer not null default 0,
  envios_sobrantes integer not null default 0,
  monto_sobrante numeric not null default 0,
  created_at timestamptz not null default now()
);

create table facturas_envios_detalle (
  id uuid primary key default uuid_generate_v4(),
  factura_id uuid not null references facturas_envios(id) on delete cascade,
  nro_envio text not null,
  fecha_envio date not null,
  concepto text not null,
  importe numeric not null default 0,
  localidad_destino text,
  cp_destino text,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now()
);

create index idx_facturas_envios_detalle_factura on facturas_envios_detalle(factura_id);
create index idx_facturas_envios_detalle_nro on facturas_envios_detalle(nro_envio);
```

- [ ] **Step 2: Run the migration in Supabase**

Run the SQL above in the Supabase SQL editor for project `rnjxmmcsxmyaktseegvt`, or via:
```bash
# From Supabase dashboard > SQL Editor > paste and run
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/facturas_envios.sql
git commit -m "feat: add facturas_envios tables for Andreani invoice control"
```

---

### Task 2: Add TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add types at the end of lib/types.ts**

```typescript
// Facturas Envíos (Andreani)
export type EstadoEnvioDetalle = 'conciliado' | 'sobrante'

export interface FacturaEnvio {
  id: string
  nro_legal: string
  fecha_comprobante: string
  fecha_desde: string
  fecha_hasta: string
  total_envios: number
  total_facturado: number
  envios_conciliados: number
  envios_sobrantes: number
  monto_sobrante: number
  created_at: string
}

export interface FacturaEnvioDetalle {
  id: string
  factura_id: string
  nro_envio: string
  fecha_envio: string
  concepto: string
  importe: number
  localidad_destino: string | null
  cp_destino: string | null
  estado: EstadoEnvioDetalle
  created_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add FacturaEnvio types"
```

---

### Task 3: Create server actions

**Files:**
- Create: `lib/actions/envios.ts`

- [ ] **Step 1: Create the server actions file**

This file handles: parsing the uploaded CSV data, querying GOcelular to validate tracking numbers, saving everything to Supabase, and deleting invoices.

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getPool } from '@/lib/db-pool'
import { revalidatePath } from 'next/cache'
import type { FacturaEnvio } from '@/lib/types'

export interface EnvioCSVRow {
  nro_envio: string
  fecha_envio: string
  concepto: string
  importe: number
  localidad_destino: string
  cp_destino: string
  nro_legal: string
  fecha_comprobante: string
}

export async function getFacturasEnvios(): Promise<FacturaEnvio[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('facturas_envios')
    .select('*')
    .order('fecha_comprobante', { ascending: false })
    .returns<FacturaEnvio[]>()
  return data ?? []
}

export async function conciliarFacturaEnvios(rows: EnvioCSVRow[]) {
  if (rows.length === 0) return { error: 'No hay filas para procesar' }

  const nroLegal = rows[0].nro_legal
  const fechaComprobante = rows[0].fecha_comprobante

  // Check if invoice already exists
  const supabase = createClient()
  const { data: existing } = await supabase
    .from('facturas_envios')
    .select('id')
    .eq('nro_legal', nroLegal)
    .single()

  if (existing) return { error: `La factura ${nroLegal} ya fue cargada` }

  // Get unique tracking numbers from CSV
  const trackingNumbers = [...new Set(rows.map(r => r.nro_envio))]

  // Query GOcelular to find which tracking numbers exist
  const pool = getPool()
  let existingTrackings = new Set<string>()

  if (pool) {
    const client = await pool.connect()
    try {
      const res = await client.query<{ tracking_number: string }>(
        `SELECT DISTINCT tracking_number
         FROM shipments
         WHERE tracking_number = ANY($1)`,
        [trackingNumbers]
      )
      existingTrackings = new Set(res.rows.map(r => r.tracking_number))
    } finally {
      client.release()
    }
  }

  // Determine date range from CSV rows
  const fechas = rows.map(r => r.fecha_envio).filter(Boolean).sort()
  const fechaDesde = fechas[0]
  const fechaHasta = fechas[fechas.length - 1]

  // Format dates from YYYYMMDD to YYYY-MM-DD
  const formatDate = (d: string) => {
    if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    return d
  }

  // Classify each row
  const detailRows = rows.map(r => ({
    nro_envio: r.nro_envio,
    fecha_envio: formatDate(r.fecha_envio),
    concepto: r.concepto,
    importe: r.importe,
    localidad_destino: r.localidad_destino || null,
    cp_destino: r.cp_destino || null,
    estado: existingTrackings.has(r.nro_envio) ? 'conciliado' : 'sobrante',
  }))

  // Aggregate by unique tracking number for summary counts
  const porEnvio = new Map<string, { estado: string; importe: number }>()
  for (const d of detailRows) {
    const existing = porEnvio.get(d.nro_envio)
    if (existing) {
      existing.importe += d.importe
    } else {
      porEnvio.set(d.nro_envio, { estado: d.estado, importe: d.importe })
    }
  }

  const conciliados = [...porEnvio.values()].filter(e => e.estado === 'conciliado').length
  const sobrantes = [...porEnvio.values()].filter(e => e.estado === 'sobrante').length
  const montoSobrante = [...porEnvio.values()]
    .filter(e => e.estado === 'sobrante')
    .reduce((sum, e) => sum + e.importe, 0)
  const totalFacturado = detailRows.reduce((sum, d) => sum + d.importe, 0)

  // Insert factura header
  const { data: factura, error: facturaError } = await supabase
    .from('facturas_envios')
    .insert({
      nro_legal: nroLegal,
      fecha_comprobante: formatDate(fechaComprobante),
      fecha_desde: formatDate(fechaDesde),
      fecha_hasta: formatDate(fechaHasta),
      total_envios: porEnvio.size,
      total_facturado: totalFacturado,
      envios_conciliados: conciliados,
      envios_sobrantes: sobrantes,
      monto_sobrante: montoSobrante,
    })
    .select('id')
    .single()

  if (facturaError || !factura) return { error: facturaError?.message ?? 'Error al guardar factura' }

  // Insert detail rows in batches of 500
  const batchSize = 500
  for (let i = 0; i < detailRows.length; i += batchSize) {
    const batch = detailRows.slice(i, i + batchSize).map(d => ({
      ...d,
      factura_id: factura.id,
    }))
    await supabase.from('facturas_envios_detalle').insert(batch)
  }

  revalidatePath('/compras/envios')
  return { ok: true, facturaId: factura.id, conciliados, sobrantes, montoSobrante }
}

export async function eliminarFacturaEnvio(id: string) {
  const supabase = createClient()
  await supabase.from('facturas_envios').delete().eq('id', id)
  revalidatePath('/compras/envios')
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/envios.ts
git commit -m "feat: add server actions for Andreani invoice conciliation"
```

---

### Task 4: Create the CSV upload client component

**Files:**
- Create: `app/(admin)/compras/envios/EnviosClient.tsx`

- [ ] **Step 1: Create the client component**

```tsx
'use client'

import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { conciliarFacturaEnvios, type EnvioCSVRow } from '@/lib/actions/envios'
import { useRouter } from 'next/navigation'

export default function EnviosClient() {
  const [rows, setRows] = useState<EnvioCSVRow[] | null>(null)
  const [parseInfo, setParseInfo] = useState<{ total: number; envios: number; nroLegal: string; fechaDesde: string; fechaHasta: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ conciliados: number; sobrantes: number; montoSobrante: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = Papa.parse<string[]>(text.trim(), { delimiter: ';', skipEmptyLines: true })
      const data = parsed.data

      if (data.length <= 1) {
        setError('El archivo está vacío o solo tiene encabezados')
        return
      }

      const csvRows: EnvioCSVRow[] = []
      for (let i = 1; i < data.length; i++) {
        const row = data[i]
        if (!row[2]?.trim()) continue // skip rows without Nro. Envio

        const importeStr = (row[18] || '0').replace(/\./g, '').replace(',', '.')
        csvRows.push({
          nro_envio: row[2].trim(),
          fecha_envio: row[3]?.trim() || '',
          concepto: row[7]?.trim() || '',
          importe: parseFloat(importeStr) || 0,
          localidad_destino: row[25]?.trim() || '',
          cp_destino: row[23]?.trim() || '',
          nro_legal: row[29]?.trim() || '',
          fecha_comprobante: row[30]?.trim() || '',
        })
      }

      if (csvRows.length === 0) {
        setError('No se encontraron filas válidas')
        return
      }

      // Calculate summary
      const uniqueEnvios = new Set(csvRows.map(r => r.nro_envio))
      const fechas = csvRows.map(r => r.fecha_envio).filter(Boolean).sort()
      const formatDateDisplay = (d: string) => {
        if (d.length === 8) return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`
        return d
      }

      setRows(csvRows)
      setParseInfo({
        total: csvRows.length,
        envios: uniqueEnvios.size,
        nroLegal: csvRows[0].nro_legal,
        fechaDesde: formatDateDisplay(fechas[0]),
        fechaHasta: formatDateDisplay(fechas[fechas.length - 1]),
      })
    }
    reader.readAsText(file, 'latin1')
  }

  async function handleSubmit() {
    if (!rows) return
    setLoading(true)
    setError(null)

    const res = await conciliarFacturaEnvios(rows)

    if ('error' in res && res.error) {
      setError(res.error)
      setLoading(false)
      return
    }

    if ('ok' in res) {
      setResult({
        conciliados: res.conciliados,
        sobrantes: res.sobrantes,
        montoSobrante: res.montoSobrante,
      })
      setRows(null)
      setParseInfo(null)
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Cargar factura de Andreani
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Subí el CSV de detalle de facturación de Andreani. Se cruza automáticamente contra los envíos de GOcelular.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200"
      />

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {parseInfo && (
        <div className="mt-4 space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 text-xs">Nro. Legal</span>
              <p className="font-semibold text-gray-900">{parseInfo.nroLegal}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Período</span>
              <p className="font-semibold text-gray-900">{parseInfo.fechaDesde} — {parseInfo.fechaHasta}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Envíos únicos</span>
              <p className="font-semibold text-gray-900">{parseInfo.envios}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Filas en CSV</span>
              <p className="font-semibold text-gray-900">{parseInfo.total}</p>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Conciliando...' : 'Conciliar factura'}
          </button>
        </div>
      )}

      {result && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          Factura procesada: {result.conciliados} envíos conciliados
          {result.sobrantes > 0 && (
            <span className="text-red-600 font-semibold">
              {' '}· {result.sobrantes} sobrantes (${new Intl.NumberFormat('es-AR').format(result.montoSobrante)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/compras/envios/EnviosClient.tsx
git commit -m "feat: add CSV upload client component for Andreani invoices"
```

---

### Task 5: Create the envíos list page

**Files:**
- Create: `app/(admin)/compras/envios/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import Link from 'next/link'
import { getFacturasEnvios } from '@/lib/actions/envios'
import { formatearMoneda } from '@/lib/utils'
import EnviosClient from './EnviosClient'

export default async function EnviosPage() {
  const facturas = await getFacturasEnvios()

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/compras" className="text-gray-400 hover:text-gray-600 text-sm">← Compras</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Control de Envíos</h1>
      <p className="text-sm text-gray-500 mb-6">Conciliación de facturas de Andreani contra envíos de GOcelular</p>

      <EnviosClient />

      {/* Lista de facturas cargadas */}
      {facturas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Nro. Legal</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Período</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Envíos</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Total facturado</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Conciliados</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Sobrantes</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Monto sobrante</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {facturas.map((f) => {
                const tieneProblemas = f.envios_sobrantes > 0
                return (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{f.nro_legal}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(f.fecha_comprobante).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(f.fecha_desde).toLocaleDateString('es-AR')} — {new Date(f.fecha_hasta).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900">{f.total_envios}</td>
                    <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(f.total_facturado)}</td>
                    <td className="px-6 py-3 text-right text-green-700 font-medium">{f.envios_conciliados}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={tieneProblemas ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                        {f.envios_sobrantes}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={tieneProblemas ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                        {f.monto_sobrante > 0 ? formatearMoneda(f.monto_sobrante) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/compras/envios/${f.id}`}
                        className="text-magenta-600 hover:text-magenta-800 text-xs font-medium">
                        Ver detalle →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/compras/envios/page.tsx
git commit -m "feat: add envíos page with invoice list and upload"
```

---

### Task 6: Create the invoice detail page

**Files:**
- Create: `app/(admin)/compras/envios/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import { notFound } from 'next/navigation'
import type { FacturaEnvio, FacturaEnvioDetalle } from '@/lib/types'

export default async function FacturaEnvioDetallePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { filtro?: string }
}) {
  const supabase = createClient()

  const { data: factura } = await supabase
    .from('facturas_envios')
    .select('*')
    .eq('id', params.id)
    .single()
    .returns<FacturaEnvio>()

  if (!factura) notFound()

  let query = supabase
    .from('facturas_envios_detalle')
    .select('*')
    .eq('factura_id', params.id)
    .order('nro_envio')

  if (searchParams.filtro === 'conciliado' || searchParams.filtro === 'sobrante') {
    query = query.eq('estado', searchParams.filtro)
  }

  const { data: detalle } = await query.returns<FacturaEnvioDetalle[]>()

  const filtroActual = searchParams.filtro || 'todos'

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/compras/envios" className="text-gray-400 hover:text-gray-600 text-sm">← Control de Envíos</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Factura {factura.nro_legal}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Período: {new Date(factura.fecha_desde).toLocaleDateString('es-AR')} — {new Date(factura.fecha_hasta).toLocaleDateString('es-AR')}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total facturado</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatearMoneda(factura.total_facturado)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Envíos totales</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{factura.total_envios}</p>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-600 uppercase tracking-wide">Conciliados</p>
          <p className="text-xl font-bold text-green-700 mt-1">{factura.envios_conciliados}</p>
        </div>
        <div className={`bg-white border rounded-xl p-4 ${factura.envios_sobrantes > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <p className={`text-xs uppercase tracking-wide ${factura.envios_sobrantes > 0 ? 'text-red-600' : 'text-gray-500'}`}>Sobrantes</p>
          <p className={`text-xl font-bold mt-1 ${factura.envios_sobrantes > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {factura.envios_sobrantes}
          </p>
          {factura.monto_sobrante > 0 && (
            <p className="text-sm text-red-600 font-semibold mt-1">{formatearMoneda(factura.monto_sobrante)}</p>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {['todos', 'conciliado', 'sobrante'].map((f) => (
          <Link
            key={f}
            href={`/compras/envios/${params.id}${f === 'todos' ? '' : `?filtro=${f}`}`}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
              filtroActual === f
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'todos' ? 'Todos' : f === 'conciliado' ? 'Conciliados' : 'Sobrantes'}
          </Link>
        ))}
      </div>

      {/* Detail table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Nro. Envío</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Concepto</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Destino</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Importe</th>
              <th className="text-center px-6 py-3 font-medium text-gray-600">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {detalle?.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-mono text-gray-900 text-xs">{d.nro_envio}</td>
                <td className="px-6 py-3 text-gray-600">
                  {new Date(d.fecha_envio).toLocaleDateString('es-AR')}
                </td>
                <td className="px-6 py-3 text-gray-600">{d.concepto}</td>
                <td className="px-6 py-3 text-gray-600">
                  {d.localidad_destino}{d.cp_destino ? ` (${d.cp_destino})` : ''}
                </td>
                <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(d.importe)}</td>
                <td className="px-6 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                    d.estado === 'conciliado'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {d.estado === 'conciliado' ? 'OK' : 'Sobrante'}
                  </span>
                </td>
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
git add app/\(admin\)/compras/envios/\[id\]/page.tsx
git commit -m "feat: add invoice detail page with conciliation results"
```

---

### Task 7: Add 4th card to Compras hub

**Files:**
- Modify: `app/(admin)/compras/page.tsx`

- [ ] **Step 1: Add the Envíos card and 'orange' color class**

In the `cards` array (after the Gestor de Pedidos card, around line 83), add:

```typescript
    {
      href: '/compras/envios',
      title: 'Envíos',
      description: 'Control de facturación de Andreani y conciliación de envíos',
      count: 0,
      countLabel: '',
      color: 'orange',
      iconPath: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    },
```

In the `colorClasses` object (around line 89), add the orange entry:

```typescript
    orange: { bg: 'bg-orange-600', text: 'text-orange-600', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
```

Change the grid from `md:grid-cols-3` to `md:grid-cols-2 lg:grid-cols-4` (around line 97):

```tsx
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
```

- [ ] **Step 2: Add dynamic count for Envíos card**

At the top of the file, add the import:

```typescript
import { getFacturasEnvios } from '@/lib/actions/envios'
```

In the `Promise.all` (around line 12), add `getFacturasEnvios()`:

```typescript
  const [proveedores, productos, pedidos, lineas, lastSync, facturasEnvios] = await Promise.all([
    getProveedores(),
    getProductos(),
    getPedidos(),
    getLineasDisponibles(),
    getLastSyncCheques(),
    getFacturasEnvios(),
  ])
```

Then update the Envíos card count:

```typescript
      count: facturasEnvios.length,
      countLabel: 'facturas cargadas',
```

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/compras/page.tsx
git commit -m "feat: add Envíos card to Compras hub"
```

---

### Task 8: Run migration, build, and test with real CSV

- [ ] **Step 1: Run the Supabase migration**

Go to Supabase dashboard for project `rnjxmmcsxmyaktseegvt` > SQL Editor and run the contents of `supabase/migrations/facturas_envios.sql`.

- [ ] **Step 2: Build the project**

```bash
cd /home/cremi/consignacion-app && npx tsc --noEmit && npx next build --no-lint
```
Expected: No type errors, build succeeds.

- [ ] **Step 3: Test locally with the Andreani CSV**

```bash
cd /home/cremi/consignacion-app && npm run dev
```

1. Go to `localhost:3000/compras` — verify 4th card "Envíos" appears
2. Click "Envíos" — verify upload page loads
3. Upload the CSV file `1720-0012009579-0598070214-2001A00490488.csv`
4. Verify preview shows: Nro. Legal, period, envíos count
5. Click "Conciliar factura" — verify results show conciliados/sobrantes
6. Verify invoice appears in the list below
7. Click "Ver detalle →" — verify detail page with filters works

- [ ] **Step 4: Deploy to production**

```bash
cd /home/cremi/consignacion-app && npx vercel --prod --yes
```

- [ ] **Step 5: Test on production with real CSV**

Upload the Andreani CSV at `https://gocelular360.vercel.app/compras/envios` and verify the conciliation results make sense.
