# Pase a Contabilidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una página "Pase a Contabilidad" que muestre un reporte mensual consolidado con la existencia final de las 5 categorías de inventario (celulares, smartwatches, parlantes, auriculares, kits) y permita descargarlo en PDF.

**Architecture:** Una server action `fetchReporteContabilidad(periodo)` consulta `stock_cierre_mensual` (4 categorías de accesorios) y `auditorias_stock_propio` (celulares, por fecha_corte del último día del mes, estado='firmada'). La página tiene un selector de mes y muestra la tabla resumen. Un endpoint `/api/pdf/pase-contabilidad` genera el PDF HTML con el mismo estilo que los PDFs existentes.

**Tech Stack:** Next.js 14 (App Router), Supabase, HTML PDF (window.print pattern)

---

## File Structure

| Action | Path | Responsabilidad |
|--------|------|-----------------|
| Create | `lib/actions/pase-contabilidad.ts` | Server action: fetch reporte consolidado por período |
| Create | `app/(admin)/pase-contabilidad/page.tsx` | Server component: selector de mes + tabla resumen |
| Create | `app/(admin)/pase-contabilidad/PaseContabilidadClient.tsx` | Client component: selector de mes, tabla, botón PDF |
| Create | `app/api/pdf/pase-contabilidad/route.tsx` | PDF endpoint: HTML con tabla consolidada para imprimir |
| Modify | `app/(admin)/layout.tsx:35` | Agregar link en sidebar grupo Inventario |

---

### Task 1: Crear server action `fetchReporteContabilidad`

**Files:**
- Create: `lib/actions/pase-contabilidad.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export interface LineaReporte {
  categoria: string
  stockFinal: number | null   // null = dato no disponible
  valuacion: number | null
  estado: 'ok' | 'pendiente' | 'sin_datos'
  nota: string | null          // ej: "Auditoría pendiente de firma"
}

export interface ReporteContabilidad {
  periodo: string
  lineas: LineaReporte[]
  totalStock: number
  totalValuacion: number
  completo: boolean  // true si todas las categorías tienen datos
}

export async function fetchPeriodosDisponibles(): Promise<string[]> {
  const sb = createAdminClient()

  // Obtener períodos de cierres de accesorios
  const { data: cierres } = await sb
    .from('stock_cierre_mensual')
    .select('periodo')
    .order('periodo', { ascending: false })

  // Obtener períodos de auditorías firmadas
  const { data: auditorias } = await sb
    .from('auditorias_stock_propio')
    .select('fecha_corte')

  const periodos = new Set<string>()
  for (const c of cierres ?? []) periodos.add(c.periodo)
  for (const a of auditorias ?? []) {
    if (a.fecha_corte) periodos.add(a.fecha_corte.slice(0, 7))
  }

  return Array.from(periodos).sort().reverse()
}

export async function fetchReporteContabilidad(periodo: string): Promise<ReporteContabilidad> {
  const sb = createAdminClient()

  // 1. Cierres de accesorios (4 categorías)
  const { data: cierres } = await sb
    .from('stock_cierre_mensual')
    .select('categoria, stock_final, valuacion')
    .eq('periodo', periodo)

  const cierreMap = new Map<string, { stock_final: number; valuacion: number }>()
  for (const c of cierres ?? []) {
    cierreMap.set(c.categoria, { stock_final: c.stock_final, valuacion: c.valuacion })
  }

  // 2. Auditoría de celulares (firmada, del último día del mes)
  const [anio, mes] = periodo.split('-').map(Number)
  const ultimoDia = new Date(anio, mes, 0).toISOString().slice(0, 10)

  const { data: auditoria } = await sb
    .from('auditorias_stock_propio')
    .select('estado, total_real, valor_existencia_final')
    .eq('fecha_corte', ultimoDia)
    .single()

  // Armar líneas
  const lineas: LineaReporte[] = []

  // Celulares
  if (!auditoria) {
    lineas.push({ categoria: 'Celulares', stockFinal: null, valuacion: null, estado: 'sin_datos', nota: 'Sin auditoría para este período' })
  } else if (auditoria.estado !== 'firmada') {
    lineas.push({ categoria: 'Celulares', stockFinal: null, valuacion: null, estado: 'pendiente', nota: `Auditoría en estado: ${auditoria.estado}` })
  } else {
    lineas.push({ categoria: 'Celulares', stockFinal: Number(auditoria.total_real), valuacion: Number(auditoria.valor_existencia_final), estado: 'ok', nota: null })
  }

  // Accesorios
  const accesorios: { key: string; label: string }[] = [
    { key: 'smartwatches', label: 'Smartwatches' },
    { key: 'parlantes', label: 'Parlantes' },
    { key: 'auriculares', label: 'Auriculares' },
    { key: 'kits-seguridad', label: 'Kits de Seguridad' },
  ]

  for (const acc of accesorios) {
    const cierre = cierreMap.get(acc.key)
    if (cierre) {
      lineas.push({ categoria: acc.label, stockFinal: cierre.stock_final, valuacion: cierre.valuacion, estado: 'ok', nota: null })
    } else {
      lineas.push({ categoria: acc.label, stockFinal: null, valuacion: null, estado: 'sin_datos', nota: 'Sin cierre para este período' })
    }
  }

  const completo = lineas.every(l => l.estado === 'ok')
  const totalStock = lineas.reduce((s, l) => s + (l.stockFinal ?? 0), 0)
  const totalValuacion = lineas.reduce((s, l) => s + (l.valuacion ?? 0), 0)

  return { periodo, lineas, totalStock, totalValuacion, completo }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/pase-contabilidad.ts
git commit -m "feat: add fetchReporteContabilidad server action"
```

---

### Task 2: Crear client component `PaseContabilidadClient`

**Files:**
- Create: `app/(admin)/pase-contabilidad/PaseContabilidadClient.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { fetchReporteContabilidad, type ReporteContabilidad } from '@/lib/actions/pase-contabilidad'

interface Props {
  periodos: string[]
  reporteInicial: ReporteContabilidad | null
}

function formatPeriodo(p: string): string {
  const [year, month] = p.split('-')
  const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${names[parseInt(month, 10) - 1]} ${year}`
}

export default function PaseContabilidadClient({ periodos, reporteInicial }: Props) {
  const [periodo, setPeriodo] = useState(periodos[0] ?? '')
  const [reporte, setReporte] = useState<ReporteContabilidad | null>(reporteInicial)
  const [pending, startTransition] = useTransition()

  function handleChangePeriodo(p: string) {
    setPeriodo(p)
    startTransition(async () => {
      const r = await fetchReporteContabilidad(p)
      setReporte(r)
    })
  }

  return (
    <>
      {/* Selector de período */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium text-gray-700">Período:</label>
        <select
          value={periodo}
          onChange={e => handleChangePeriodo(e.target.value)}
          disabled={pending}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {periodos.map(p => (
            <option key={p} value={p}>{formatPeriodo(p)}</option>
          ))}
        </select>
        {pending && <span className="text-xs text-gray-400">Cargando...</span>}
      </div>

      {periodos.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No hay períodos con datos de cierre disponibles.
        </div>
      )}

      {reporte && (
        <>
          {/* Advertencia si incompleto */}
          {!reporte.completo && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
              <strong>Reporte incompleto:</strong> faltan datos de alguna categoría. Revisá las notas en la tabla.
            </div>
          )}

          {/* Tabla resumen */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Categoría</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Existencia Final</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Valuación</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reporte.lineas.map(l => (
                  <tr key={l.categoria} className={l.estado !== 'ok' ? 'bg-amber-50/50' : 'hover:bg-gray-50'}>
                    <td className="px-6 py-3 font-medium text-gray-900">{l.categoria}</td>
                    <td className="px-6 py-3 text-right text-blue-600 font-bold">
                      {l.stockFinal !== null ? l.stockFinal : '—'}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900 font-semibold">
                      {l.valuacion !== null ? formatearMoneda(l.valuacion) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      {l.estado === 'ok' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          Completo
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700">{l.nota}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td className="px-6 py-3 text-gray-900">TOTAL</td>
                  <td className="px-6 py-3 text-right text-blue-600">{reporte.totalStock}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(reporte.totalValuacion)}</td>
                  <td className="px-6 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Botón PDF */}
          <a
            href={`/api/pdf/pase-contabilidad?periodo=${reporte.periodo}`}
            target="_blank"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              reporte.completo
                ? 'bg-[#E91E7B] text-white hover:bg-[#d11a6e]'
                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descargar PDF
          </a>
          {!reporte.completo && (
            <p className="text-xs text-gray-400 mt-2">El PDF incluirá solo las categorías con datos completos.</p>
          )}
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/pase-contabilidad/PaseContabilidadClient.tsx
git commit -m "feat: add PaseContabilidadClient component with period selector and table"
```

---

### Task 3: Crear server page

**Files:**
- Create: `app/(admin)/pase-contabilidad/page.tsx`

- [ ] **Step 1: Crear la página**

```tsx
export const dynamic = 'force-dynamic'

import { fetchPeriodosDisponibles, fetchReporteContabilidad } from '@/lib/actions/pase-contabilidad'
import PaseContabilidadClient from './PaseContabilidadClient'

export default async function PaseContabilidadPage() {
  const periodos = await fetchPeriodosDisponibles()
  const reporteInicial = periodos.length > 0
    ? await fetchReporteContabilidad(periodos[0])
    : null

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Pase a Contabilidad</h1>
      <p className="text-sm text-gray-500 mb-6">
        Reporte mensual de existencias finales para contabilidad y cálculo de costo de ventas.
      </p>

      <PaseContabilidadClient periodos={periodos} reporteInicial={reporteInicial} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/pase-contabilidad/page.tsx
git commit -m "feat: add pase-contabilidad server page"
```

---

### Task 4: Crear endpoint PDF

**Files:**
- Create: `app/api/pdf/pase-contabilidad/route.tsx`

Sigue el patrón exacto de `app/api/pdf/auditoria-stock/[id]/route.tsx`: devuelve HTML con `window.print()`.

- [ ] **Step 1: Crear el endpoint**

```tsx
import { NextResponse } from 'next/server'
import { fetchReporteContabilidad } from '@/lib/actions/pase-contabilidad'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const periodo = searchParams.get('periodo')
  if (!periodo) return NextResponse.json({ error: 'periodo requerido' }, { status: 400 })

  const reporte = await fetchReporteContabilidad(periodo)
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  const [anio, mes] = periodo.split('-')
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const periodoLabel = `${monthNames[parseInt(mes, 10) - 1]} ${anio}`

  const rows = reporte.lineas.map(l =>
    `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:500">${l.categoria}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#2563eb">
        ${l.stockFinal !== null ? l.stockFinal : '—'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">
        ${l.valuacion !== null ? fmt(l.valuacion) : '—'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:11px;color:${l.estado === 'ok' ? '#15803d' : '#b45309'}">
        ${l.estado === 'ok' ? 'Completo' : (l.nota ?? 'Sin datos')}
      </td>
    </tr>`
  ).join('')

  const html = `<!DOCTYPE html><html><head><title>Pase a Contabilidad - ${periodoLabel}</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:30px;color:#333;font-size:13px}
.header{display:flex;justify-content:space-between;border-bottom:3px solid #E91E7B;padding-bottom:12px;margin-bottom:24px}
.header h1{color:#E91E7B;font-size:20px;margin:0}
.header p{margin:2px 0;font-size:11px;color:#666}
.periodo{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin-bottom:20px;text-align:center}
.periodo strong{font-size:18px;color:#0369a1}
table{width:100%;border-collapse:collapse;margin:12px 0}
th{background:#f3f4f6;padding:10px 12px;text-align:left;border-bottom:2px solid #d1d5db;font-size:12px}
.totals td{border-top:3px solid #333;font-weight:bold;padding:10px 12px;font-size:14px}
.total-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;text-align:center}
.total-box strong{font-size:24px;color:#15803d}
@media print{body{padding:15px}}
</style></head><body>
<div class="header">
  <div><h1>GOcelular</h1><p>PASE A CONTABILIDAD</p><p>Reporte de Existencias Finales</p></div>
  <div style="text-align:right"><p><strong>Período:</strong> ${periodoLabel}</p><p><strong>Generado:</strong> ${new Date().toLocaleDateString('es-AR')}</p></div>
</div>
<div class="periodo"><p style="margin:0;font-size:12px;color:#666">Período</p><strong>${periodoLabel}</strong></div>
<table>
  <thead><tr>
    <th>Categoría</th>
    <th style="text-align:center">Existencia Final</th>
    <th style="text-align:right">Valuación</th>
    <th>Estado</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tbody><tr class="totals">
    <td>TOTAL</td>
    <td style="text-align:center">${reporte.totalStock}</td>
    <td style="text-align:right">${fmt(reporte.totalValuacion)}</td>
    <td></td>
  </tr></tbody>
</table>
<div class="total-box">
  <p style="margin:0 0 4px 0;font-size:12px;color:#666">Valuación Total de Existencias</p>
  <strong>${fmt(reporte.totalValuacion)}</strong>
</div>
${!reporte.completo ? '<p style="color:#b45309;font-size:11px;margin-top:12px">⚠ Reporte incompleto: algunas categorías no tienen datos para este período.</p>' : ''}
<p style="text-align:center;font-size:9px;color:#9ca3af;margin-top:40px">Generado por GOcelular360</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/pdf/pase-contabilidad/route.tsx
git commit -m "feat: add PDF endpoint for pase a contabilidad report"
```

---

### Task 5: Agregar link en sidebar

**Files:**
- Modify: `app/(admin)/layout.tsx:35`

- [ ] **Step 1: Agregar el link**

Después de la línea:
```typescript
{ href: '/auditoria-stock', label: 'Auditoría Stock', icon: 'auditorias' },
```

Agregar:
```typescript
{ href: '/pase-contabilidad', label: 'Pase a Contabilidad', icon: 'auditorias' },
```

- [ ] **Step 2: Verificar TypeScript**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/layout.tsx
git commit -m "feat: add pase-contabilidad to sidebar navigation"
```

---

### Task 6: Verificación final y deploy

- [ ] **Step 1: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 2: Deploy a producción**

Run: `npx vercel --prod --yes`

- [ ] **Step 3: Verificar en producción**

- https://gocelular360.vercel.app/pase-contabilidad
- Verificar selector de período
- Verificar tabla con 5 categorías
- Click "Descargar PDF" → se abre HTML con diálogo de impresión
- Verificar que aparece en el sidebar bajo "Auditoría Stock"
