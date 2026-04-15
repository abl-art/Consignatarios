# Admin Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete admin workflow: assign devices with signature, audit via barcode scanning, track discrepancies, report commissions, and improve dashboard.

**Architecture:** Server components for data loading + client components for interactive features (signature canvas, barcode scanner, form state). Server actions for mutations. PDF generation with `@react-pdf/renderer`. All pages follow existing Tailwind patterns inside `app/(admin)/`.

**Tech Stack:** Next.js 14 App Router, Supabase, `@react-pdf/renderer` (installed), `html5-qrcode` (new), Tailwind CSS.

---

### Task 1: Install html5-qrcode dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

Run: `cd /home/cremi/consignacion-app && npm install html5-qrcode`

- [ ] **Step 2: Verify installation**

Run: `node -e "require('html5-qrcode'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add html5-qrcode for barcode scanning"
```

---

### Task 2: FirmaCanvas shared component

**Files:**
- Create: `app/(admin)/components/FirmaCanvas.tsx`

- [ ] **Step 1: Create the signature canvas component**

```tsx
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface FirmaCanvasProps {
  onSave: (base64: string) => void
  width?: number
  height?: number
}

export default function FirmaCanvas({ onSave, width = 500, height = 200 }: FirmaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [width, height])

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }, [])

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    setDrawing(true)
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasStrokes(true)
  }, [drawing, getPos])

  const endDraw = useCallback(() => {
    setDrawing(false)
  }, [])

  function clear() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    setHasStrokes(false)
  }

  function save() {
    if (!canvasRef.current || !hasStrokes) return
    onSave(canvasRef.current.toDataURL('image/png'))
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">Firma del consignatario</p>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-gray-300 rounded-lg w-full touch-none cursor-crosshair"
        style={{ maxWidth: width }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={clear}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
          Limpiar
        </button>
        <button type="button" onClick={save} disabled={!hasStrokes}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          Confirmar firma
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/cremi/consignacion-app && npx next build 2>&1 | tail -5` or navigate to a page that imports it.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/components/FirmaCanvas.tsx
git commit -m "feat: add FirmaCanvas touch signature component"
```

---

### Task 3: EscanerIMEI shared component

**Files:**
- Create: `app/(admin)/components/EscanerIMEI.tsx`

- [ ] **Step 1: Create the barcode scanner component**

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { validarIMEI } from '@/lib/utils'

interface EscanerIMEIProps {
  onScan: (imei: string) => void
  disabled?: boolean
}

export default function EscanerIMEI({ onScan, disabled }: EscanerIMEIProps) {
  const [cameraOn, setCameraOn] = useState(false)
  const [manualIMEI, setManualIMEI] = useState('')
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<string>('scanner-' + Math.random().toString(36).slice(2))

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setCameraOn(false)
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const scanner = new Html5Qrcode(containerRef.current)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 100 } },
        (decodedText) => {
          const clean = decodedText.replace(/\D/g, '')
          if (validarIMEI(clean)) {
            setLastScanned(clean)
            onScan(clean)
          }
        },
        () => {}
      )
      setCameraOn(true)
    } catch (err: any) {
      setError('No se pudo acceder a la cámara. Verificá los permisos.')
    }
  }, [onScan])

  useEffect(() => {
    return () => { stopCamera() }
  }, [stopCamera])

  function handleManualAdd() {
    const clean = manualIMEI.trim()
    if (!validarIMEI(clean)) {
      setError('IMEI inválido — debe tener 15 dígitos numéricos')
      return
    }
    setError(null)
    setLastScanned(clean)
    onScan(clean)
    setManualIMEI('')
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button type="button" onClick={cameraOn ? stopCamera : startCamera} disabled={disabled}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            cameraOn
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-50`}>
          {cameraOn ? 'Apagar cámara' : 'Escanear con cámara'}
        </button>
      </div>

      <div id={containerRef.current} className={cameraOn ? 'rounded-lg overflow-hidden' : 'hidden'} />

      {/* Manual fallback */}
      <div className="flex gap-2">
        <input
          type="text"
          value={manualIMEI}
          onChange={(e) => setManualIMEI(e.target.value.replace(/\D/g, '').slice(0, 15))}
          placeholder="Ingresar IMEI manualmente"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
          disabled={disabled}
        />
        <button type="button" onClick={handleManualAdd} disabled={disabled || !manualIMEI}
          className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50">
          Agregar
        </button>
      </div>

      {lastScanned && (
        <p className="text-xs text-green-700">Ultimo escaneado: <span className="font-mono">{lastScanned}</span></p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/components/EscanerIMEI.tsx
git commit -m "feat: add EscanerIMEI barcode scanner with camera and manual input"
```

---

### Task 4: Asignar Stock page

**Files:**
- Create: `app/(admin)/asignar/page.tsx`
- Create: `app/(admin)/asignar/AsignarForm.tsx`
- Create: `lib/actions/asignar.ts`

- [ ] **Step 1: Create the server action**

```ts
// lib/actions/asignar.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface AsignarInput {
  consignatario_id: string
  dispositivo_ids: string[]
  firmado_por: string
  firma_base64: string
  total_valor_costo: number
  total_valor_venta: number
}

export async function asignarStock(input: AsignarInput) {
  const supabase = createClient()

  const { data: asignacion, error: asigError } = await supabase
    .from('asignaciones')
    .insert({
      consignatario_id: input.consignatario_id,
      fecha: new Date().toISOString().split('T')[0],
      total_unidades: input.dispositivo_ids.length,
      total_valor_costo: input.total_valor_costo,
      total_valor_venta: input.total_valor_venta,
      firmado_por: input.firmado_por,
      firma_url: input.firma_base64,
    })
    .select('id')
    .single()

  if (asigError || !asignacion) {
    return { error: asigError?.message ?? 'Error al crear asignación' }
  }

  // Insert items
  const items = input.dispositivo_ids.map((did) => ({
    asignacion_id: asignacion.id,
    dispositivo_id: did,
  }))
  const { error: itemsError } = await supabase.from('asignacion_items').insert(items)

  if (itemsError) {
    await supabase.from('asignaciones').delete().eq('id', asignacion.id)
    return { error: itemsError.message }
  }

  // Update device states
  const { error: updateError } = await supabase
    .from('dispositivos')
    .update({ estado: 'asignado', consignatario_id: input.consignatario_id })
    .in('id', input.dispositivo_ids)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath('/asignar')
  revalidatePath('/inventario')
  revalidatePath('/dashboard')
  return { ok: true, asignacion_id: asignacion.id }
}
```

- [ ] **Step 2: Create the client form component**

```tsx
// app/(admin)/asignar/AsignarForm.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda, calcularPrecioVenta } from '@/lib/utils'
import { asignarStock } from '@/lib/actions/asignar'
import FirmaCanvas from '../components/FirmaCanvas'
import type { Consignatario, DispositivoConModelo, Config } from '@/lib/types'

interface Props {
  consignatarios: Consignatario[]
  dispositivos: DispositivoConModelo[]
  multiplicador: number
}

export default function AsignarForm({ consignatarios, dispositivos, multiplicador }: Props) {
  const router = useRouter()
  const [consignatarioId, setConsignatarioId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [firmadoPor, setFirmadoPor] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [filtroModelo, setFiltroModelo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = dispositivos.filter((d) => {
    if (!filtroModelo) return true
    const label = `${d.modelos.marca} ${d.modelos.modelo}`.toLowerCase()
    return label.includes(filtroModelo.toLowerCase())
  })

  const selectedDevices = dispositivos.filter((d) => selected.has(d.id))
  const totalCosto = selectedDevices.reduce((s, d) => s + d.modelos.precio_costo, 0)
  const totalVenta = selectedDevices.reduce((s, d) => s + calcularPrecioVenta(d.modelos.precio_costo, multiplicador), 0)

  function toggleDevice(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((d) => d.id)))
  }

  async function handleSubmit() {
    if (!consignatarioId || selected.size === 0 || !firmadoPor || !firma) return
    setSubmitting(true)
    setError(null)
    const result = await asignarStock({
      consignatario_id: consignatarioId,
      dispositivo_ids: Array.from(selected),
      firmado_por: firmadoPor,
      firma_base64: firma,
      total_valor_costo: totalCosto,
      total_valor_venta: totalVenta,
    })
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      router.push('/inventario')
    }
  }

  const canSubmit = consignatarioId && selected.size > 0 && firmadoPor && firma && !submitting

  return (
    <div className="space-y-6">
      {/* Consignatario selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Consignatario</label>
        <select value={consignatarioId} onChange={(e) => setConsignatarioId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Seleccionar consignatario</option>
          {consignatarios.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {/* Device list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Dispositivos disponibles ({dispositivos.length})</h2>
          <input value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)}
            placeholder="Filtrar por modelo..." className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-56" />
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={selectAll} className="rounded border-gray-300" />
                </th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">IMEI</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">P. Costo</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">P. Venta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((d) => (
                <tr key={d.id} className={`hover:bg-gray-50 cursor-pointer ${selected.has(d.id) ? 'bg-blue-50' : ''}`}
                  onClick={() => toggleDevice(d.id)}>
                  <td className="px-6 py-3">
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleDevice(d.id)}
                      className="rounded border-gray-300" />
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                  <td className="px-6 py-3 text-gray-900">{d.modelos.marca} {d.modelos.modelo}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{formatearMoneda(d.modelos.precio_costo)}</td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900">
                    {formatearMoneda(calcularPrecioVenta(d.modelos.precio_costo, multiplicador))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary + signature */}
      {selected.size > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Equipos</p>
              <p className="text-2xl font-bold text-blue-700">{selected.size}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Valor costo</p>
              <p className="text-lg font-bold text-gray-700">{formatearMoneda(totalCosto)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Valor venta</p>
              <p className="text-lg font-bold text-green-700">{formatearMoneda(totalVenta)}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recibido por (nombre)</label>
            <input value={firmadoPor} onChange={(e) => setFirmadoPor(e.target.value)}
              placeholder="Nombre de quien recibe la mercadería"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          <FirmaCanvas onSave={setFirma} />

          {firma && <p className="text-xs text-green-700">Firma capturada</p>}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button onClick={handleSubmit} disabled={!canSubmit}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Asignando...' : `Asignar ${selected.size} equipos`}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create the server page**

```tsx
// app/(admin)/asignar/page.tsx
import { createClient } from '@/lib/supabase/server'
import type { Consignatario, DispositivoConModelo, Config } from '@/lib/types'
import AsignarForm from './AsignarForm'

export default async function AsignarPage() {
  const supabase = createClient()

  const [{ data: consignatarios }, { data: dispositivos }, { data: config }] = await Promise.all([
    supabase.from('consignatarios').select('*').order('nombre').returns<Consignatario[]>(),
    supabase.from('dispositivos').select('*, modelos(*)').eq('estado', 'disponible')
      .order('created_at', { ascending: false }).returns<DispositivoConModelo[]>(),
    supabase.from('config').select('*').single<Config>(),
  ])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Asignar stock</h1>
      <p className="text-sm text-gray-500 mb-8">Seleccioná equipos disponibles para entregar a un consignatario</p>
      <AsignarForm
        consignatarios={consignatarios ?? []}
        dispositivos={dispositivos ?? []}
        multiplicador={config?.multiplicador ?? 1.8}
      />
    </div>
  )
}
```

- [ ] **Step 4: Verify page loads**

Navigate to http://localhost:3000/asignar and confirm it renders.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/asignar.ts app/\(admin\)/asignar/
git commit -m "feat: add asignar stock page with device selection and signature"
```

---

### Task 5: Auditorias listing page

**Files:**
- Create: `app/(admin)/auditorias/page.tsx`

- [ ] **Step 1: Create the auditorias listing page**

```tsx
// app/(admin)/auditorias/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Consignatario } from '@/lib/types'

interface AuditoriaRow {
  id: string
  consignatario_id: string
  realizada_por: string
  fecha: string
  estado: 'borrador' | 'confirmada'
  observaciones: string | null
  created_at: string
}

export default async function AuditoriasPage() {
  const supabase = createClient()

  const [{ data: auditorias }, { data: consignatarios }] = await Promise.all([
    supabase.from('auditorias').select('*').order('created_at', { ascending: false }).returns<AuditoriaRow[]>(),
    supabase.from('consignatarios').select('id, nombre').returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  const consigMap = (consignatarios ?? []).reduce<Record<string, string>>((m, c) => {
    m[c.id] = c.nombre
    return m
  }, {})

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Auditorias</h1>
        <Link href="/auditorias/nueva"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          Nueva auditoría
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Consignatario</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Realizada por</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {auditorias?.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-gray-700">{new Date(a.fecha).toLocaleDateString('es-AR')}</td>
                <td className="px-6 py-3 font-medium text-gray-900">{consigMap[a.consignatario_id] ?? '-'}</td>
                <td className="px-6 py-3 text-gray-700">{a.realizada_por}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.estado === 'confirmada' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {a.estado === 'confirmada' ? 'Confirmada' : 'Borrador'}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <Link href={`/auditorias/${a.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                    Ver detalle →
                  </Link>
                </td>
              </tr>
            ))}
            {(!auditorias || auditorias.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  No hay auditorías registradas
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
git add app/\(admin\)/auditorias/page.tsx
git commit -m "feat: add auditorias listing page"
```

---

### Task 6: Nueva Auditoria page with barcode scanning

**Files:**
- Create: `app/(admin)/auditorias/nueva/page.tsx`
- Create: `app/(admin)/auditorias/nueva/NuevaAuditoriaForm.tsx`
- Create: `lib/actions/auditorias.ts`

- [ ] **Step 1: Create the server action**

```ts
// lib/actions/auditorias.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface AuditoriaInput {
  consignatario_id: string
  realizada_por: string
  observaciones: string
  firma_base64: string
  items: { dispositivo_id: string; presente: boolean }[]
  confirmar: boolean
}

export async function crearAuditoria(input: AuditoriaInput) {
  const supabase = createClient()

  const { data: auditoria, error: audError } = await supabase
    .from('auditorias')
    .insert({
      consignatario_id: input.consignatario_id,
      realizada_por: input.realizada_por,
      fecha: new Date().toISOString().split('T')[0],
      estado: input.confirmar ? 'borrador' : 'borrador', // will be updated by RPC if confirmar
      observaciones: input.observaciones || null,
      firma_url: input.firma_base64,
    })
    .select('id')
    .single()

  if (audError || !auditoria) {
    return { error: audError?.message ?? 'Error al crear auditoría' }
  }

  const auditoriaItems = input.items.map((i) => ({
    auditoria_id: auditoria.id,
    dispositivo_id: i.dispositivo_id,
    presente: i.presente,
  }))

  const { error: itemsError } = await supabase.from('auditoria_items').insert(auditoriaItems)

  if (itemsError) {
    await supabase.from('auditorias').delete().eq('id', auditoria.id)
    return { error: itemsError.message }
  }

  if (input.confirmar) {
    const { error: rpcError } = await supabase.rpc('calcular_diferencias_auditoria', {
      p_auditoria_id: auditoria.id,
    })
    if (rpcError) {
      return { error: rpcError.message }
    }
  }

  revalidatePath('/auditorias')
  revalidatePath('/diferencias')
  revalidatePath('/dashboard')
  return { ok: true, auditoria_id: auditoria.id }
}
```

- [ ] **Step 2: Create the client form component**

```tsx
// app/(admin)/auditorias/nueva/NuevaAuditoriaForm.tsx
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import EscanerIMEI from '../../components/EscanerIMEI'
import FirmaCanvas from '../../components/FirmaCanvas'
import { crearAuditoria } from '@/lib/actions/auditorias'
import type { Consignatario, DispositivoConModelo } from '@/lib/types'

interface Props {
  consignatarios: Consignatario[]
  dispositivosPorConsignatario: Record<string, DispositivoConModelo[]>
}

export default function NuevaAuditoriaForm({ consignatarios, dispositivosPorConsignatario }: Props) {
  const router = useRouter()
  const [consignatarioId, setConsignatarioId] = useState('')
  const [realizadaPor, setRealizadaPor] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [scannedIMEIs, setScannedIMEIs] = useState<Set<string>>(new Set())
  const [firma, setFirma] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanFeedback, setScanFeedback] = useState<{ msg: string; type: 'ok' | 'warn' | 'dup' } | null>(null)

  const dispositivos = dispositivosPorConsignatario[consignatarioId] ?? []
  const imeiToDevice = new Map(dispositivos.map((d) => [d.imei, d]))

  const handleScan = useCallback((imei: string) => {
    if (scannedIMEIs.has(imei)) {
      setScanFeedback({ msg: `${imei} — Ya escaneado`, type: 'dup' })
      return
    }
    if (!imeiToDevice.has(imei)) {
      setScanFeedback({ msg: `${imei} — IMEI no esperado para este consignatario`, type: 'warn' })
      return
    }
    setScannedIMEIs((prev) => new Set(prev).add(imei))
    setScanFeedback({ msg: `${imei} — Presente`, type: 'ok' })
  }, [scannedIMEIs, imeiToDevice])

  async function handleSubmit(confirmar: boolean) {
    if (!consignatarioId || !realizadaPor || !firma) return
    setSubmitting(true)
    setError(null)

    const items = dispositivos.map((d) => ({
      dispositivo_id: d.id,
      presente: scannedIMEIs.has(d.imei),
    }))

    const result = await crearAuditoria({
      consignatario_id: consignatarioId,
      realizada_por: realizadaPor,
      observaciones,
      firma_base64: firma,
      items,
      confirmar,
    })
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
    } else {
      router.push('/auditorias')
    }
  }

  const presentCount = scannedIMEIs.size
  const totalCount = dispositivos.length
  const missingCount = totalCount - presentCount

  return (
    <div className="space-y-6">
      {/* Select consignatario */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Consignatario a auditar</label>
        <select value={consignatarioId} onChange={(e) => { setConsignatarioId(e.target.value); setScannedIMEIs(new Set()) }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Seleccionar consignatario</option>
          {consignatarios.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {consignatarioId && dispositivos.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center text-sm text-yellow-700">
          Este consignatario no tiene dispositivos asignados.
        </div>
      )}

      {consignatarioId && dispositivos.length > 0 && (
        <>
          {/* Progress */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Escaneo de dispositivos</h2>
              <span className="text-sm font-medium text-gray-600">
                {presentCount} / {totalCount} escaneados
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all"
                style={{ width: `${totalCount > 0 ? (presentCount / totalCount) * 100 : 0}%` }} />
            </div>

            <EscanerIMEI onScan={handleScan} />

            {scanFeedback && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-sm font-medium ${
                scanFeedback.type === 'ok' ? 'bg-green-50 text-green-700' :
                scanFeedback.type === 'warn' ? 'bg-red-50 text-red-700' :
                'bg-yellow-50 text-yellow-700'
              }`}>
                {scanFeedback.msg}
              </div>
            )}
          </div>

          {/* Device list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex gap-4">
              <span className="text-sm text-green-700 font-medium">Presentes: {presentCount}</span>
              <span className="text-sm text-red-600 font-medium">Faltantes: {missingCount}</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-600">IMEI</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
                    <th className="text-center px-6 py-3 font-medium text-gray-600">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dispositivos.map((d) => {
                    const presente = scannedIMEIs.has(d.imei)
                    return (
                      <tr key={d.id} className={presente ? 'bg-green-50' : ''}>
                        <td className="px-6 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                        <td className="px-6 py-3 text-gray-900">{d.modelos.marca} {d.modelos.modelo}</td>
                        <td className="px-6 py-3 text-center">
                          {presente
                            ? <span className="text-green-600 font-medium">Presente</span>
                            : <span className="text-gray-400">Pendiente</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Auditor + observations + signature */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Realizada por</label>
              <input value={realizadaPor} onChange={(e) => setRealizadaPor(e.target.value)}
                placeholder="Nombre del auditor"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                rows={3} placeholder="Observaciones de la auditoría (opcional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>

            <FirmaCanvas onSave={setFirma} />
            {firma && <p className="text-xs text-green-700">Firma capturada</p>}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => handleSubmit(false)} disabled={!realizadaPor || !firma || submitting}
                className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {submitting ? 'Guardando...' : 'Guardar borrador'}
              </button>
              <button onClick={() => handleSubmit(true)} disabled={!realizadaPor || !firma || submitting}
                className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'Confirmando...' : 'Confirmar auditoría'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create the server page**

```tsx
// app/(admin)/auditorias/nueva/page.tsx
import { createClient } from '@/lib/supabase/server'
import type { Consignatario, DispositivoConModelo } from '@/lib/types'
import NuevaAuditoriaForm from './NuevaAuditoriaForm'

export default async function NuevaAuditoriaPage() {
  const supabase = createClient()

  const [{ data: consignatarios }, { data: dispositivos }] = await Promise.all([
    supabase.from('consignatarios').select('*').order('nombre').returns<Consignatario[]>(),
    supabase.from('dispositivos').select('*, modelos(*)').eq('estado', 'asignado')
      .order('created_at', { ascending: false }).returns<DispositivoConModelo[]>(),
  ])

  // Group by consignatario
  const porConsignatario: Record<string, DispositivoConModelo[]> = {}
  for (const d of dispositivos ?? []) {
    if (!d.consignatario_id) continue
    if (!porConsignatario[d.consignatario_id]) porConsignatario[d.consignatario_id] = []
    porConsignatario[d.consignatario_id].push(d)
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nueva auditoría</h1>
      <p className="text-sm text-gray-500 mb-8">Escaneá los dispositivos presentes en el punto de venta</p>
      <NuevaAuditoriaForm
        consignatarios={consignatarios ?? []}
        dispositivosPorConsignatario={porConsignatario}
      />
    </div>
  )
}
```

- [ ] **Step 4: Verify page loads**

Navigate to http://localhost:3000/auditorias/nueva and confirm it renders.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/auditorias.ts app/\(admin\)/auditorias/
git commit -m "feat: add auditorias with IMEI barcode scanning and signature"
```

---

### Task 7: Diferencias page

**Files:**
- Create: `app/(admin)/diferencias/page.tsx`
- Create: `app/(admin)/diferencias/DiferenciaActions.tsx`
- Create: `lib/actions/diferencias.ts`

- [ ] **Step 1: Create the server action**

```ts
// lib/actions/diferencias.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { EstadoDiferencia } from '@/lib/types'

export async function actualizarEstadoDiferencia(id: string, estado: EstadoDiferencia) {
  const supabase = createClient()
  const { error } = await supabase.from('diferencias').update({ estado }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/diferencias')
  revalidatePath('/dashboard')
  return { ok: true }
}
```

- [ ] **Step 2: Create the client actions component**

```tsx
// app/(admin)/diferencias/DiferenciaActions.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarEstadoDiferencia } from '@/lib/actions/diferencias'
import type { EstadoDiferencia } from '@/lib/types'

export default function DiferenciaActions({ id, estado }: { id: string; estado: EstadoDiferencia }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function cambiar(nuevoEstado: EstadoDiferencia) {
    setLoading(true)
    await actualizarEstadoDiferencia(id, nuevoEstado)
    setLoading(false)
    router.refresh()
  }

  if (estado !== 'pendiente') return null

  return (
    <div className="flex gap-1">
      <button onClick={() => cambiar('cobrado')} disabled={loading}
        className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50">
        Cobrado
      </button>
      <button onClick={() => cambiar('resuelto')} disabled={loading}
        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50">
        Resuelto
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create the diferencias page**

```tsx
// app/(admin)/diferencias/page.tsx
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import DiferenciaActions from './DiferenciaActions'
import type { Diferencia, Consignatario, DispositivoConModelo } from '@/lib/types'

interface DifRow extends Diferencia {
  dispositivos: { imei: string; modelos: { marca: string; modelo: string } }
  auditorias: { consignatario_id: string }
}

export default async function DiferenciasPage({
  searchParams,
}: {
  searchParams: { consignatario?: string; tipo?: string; estado?: string }
}) {
  const supabase = createClient()

  let query = supabase
    .from('diferencias')
    .select('*, dispositivos(imei, modelos(marca, modelo)), auditorias(consignatario_id)')
    .order('created_at', { ascending: false })

  if (searchParams.tipo) query = query.eq('tipo', searchParams.tipo)
  if (searchParams.estado) query = query.eq('estado', searchParams.estado)

  const [{ data: diferencias }, { data: consignatarios }] = await Promise.all([
    query.returns<DifRow[]>(),
    supabase.from('consignatarios').select('id, nombre').returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  const consigMap = (consignatarios ?? []).reduce<Record<string, string>>((m, c) => { m[c.id] = c.nombre; return m }, {})

  let filtered = diferencias ?? []
  if (searchParams.consignatario) {
    filtered = filtered.filter((d) => d.auditorias.consignatario_id === searchParams.consignatario)
  }

  // Summary
  const pendientes = filtered.filter((d) => d.estado === 'pendiente')
  const totalPendiente = pendientes.reduce((s, d) => s + d.monto_deuda, 0)
  const cobradas = filtered.filter((d) => d.estado === 'cobrado')
  const totalCobrado = cobradas.reduce((s, d) => s + d.monto_deuda, 0)

  const ESTADO_COLORS: Record<string, string> = {
    pendiente: 'bg-red-100 text-red-700',
    cobrado: 'bg-green-100 text-green-700',
    resuelto: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Diferencias</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Pendiente</p>
          <p className="text-2xl font-bold text-red-700">{formatearMoneda(totalPendiente)}</p>
          <p className="text-xs text-gray-400">{pendientes.length} diferencias</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Cobrado</p>
          <p className="text-2xl font-bold text-green-700">{formatearMoneda(totalCobrado)}</p>
          <p className="text-xs text-gray-400">{cobradas.length} diferencias</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500">Total diferencias</p>
          <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
        </div>
      </div>

      {/* Filters */}
      <form className="flex gap-3 mb-6 flex-wrap">
        <select name="consignatario" defaultValue={searchParams.consignatario ?? ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todos los consignatarios</option>
          {consignatarios?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select name="tipo" defaultValue={searchParams.tipo ?? ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todos los tipos</option>
          <option value="faltante">Faltante</option>
          <option value="sobrante">Sobrante</option>
        </select>
        <select name="estado" defaultValue={searchParams.estado ?? ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="cobrado">Cobrado</option>
          <option value="resuelto">Resuelto</option>
        </select>
        <button type="submit"
          className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900">
          Filtrar
        </button>
      </form>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">IMEI</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Consignatario</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Tipo</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Monto</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-mono text-xs text-gray-700">{d.dispositivos.imei}</td>
                <td className="px-6 py-3 text-gray-900">{d.dispositivos.modelos.marca} {d.dispositivos.modelos.modelo}</td>
                <td className="px-6 py-3 text-gray-700">{consigMap[d.auditorias.consignatario_id] ?? '-'}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    d.tipo === 'faltante' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{d.tipo}</span>
                </td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">{formatearMoneda(d.monto_deuda)}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[d.estado]}`}>
                    {d.estado}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <DiferenciaActions id={d.id} estado={d.estado} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                  No hay diferencias registradas
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

- [ ] **Step 4: Commit**

```bash
git add lib/actions/diferencias.ts app/\(admin\)/diferencias/
git commit -m "feat: add diferencias page with filters and status management"
```

---

### Task 8: Reportes page

**Files:**
- Create: `app/(admin)/reportes/page.tsx`

- [ ] **Step 1: Create the reportes page**

```tsx
// app/(admin)/reportes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { Consignatario, Venta, Diferencia } from '@/lib/types'

export default async function ReportesPage() {
  const supabase = createClient()

  const [{ data: consignatarios }, { data: ventas }, { data: diferencias }, { data: dispositivos }] = await Promise.all([
    supabase.from('consignatarios').select('*').order('nombre').returns<Consignatario[]>(),
    supabase.from('ventas').select('*').returns<Venta[]>(),
    supabase.from('diferencias').select('*, auditorias(consignatario_id)').returns<(Diferencia & { auditorias: { consignatario_id: string } })[]>(),
    supabase.from('dispositivos').select('consignatario_id, estado'),
  ])

  const consigs = consignatarios ?? []
  const consigMap = consigs.reduce<Record<string, string>>((m, c) => { m[c.id] = c.nombre; return m }, {})

  // Comisiones por consignatario y mes
  const comisionesMap: Record<string, Record<string, number>> = {}
  const meses = new Set<string>()
  for (const v of ventas ?? []) {
    const mes = v.fecha_venta.slice(0, 7) // YYYY-MM
    meses.add(mes)
    if (!comisionesMap[v.consignatario_id]) comisionesMap[v.consignatario_id] = {}
    comisionesMap[v.consignatario_id][mes] = (comisionesMap[v.consignatario_id][mes] ?? 0) + v.comision_monto
  }
  const mesesSorted = Array.from(meses).sort()

  // Stock por consignatario
  const stockMap: Record<string, { asignados: number; vendidos: number }> = {}
  for (const d of dispositivos?.filter((d) => d.consignatario_id) ?? []) {
    if (!stockMap[d.consignatario_id]) stockMap[d.consignatario_id] = { asignados: 0, vendidos: 0 }
    if (d.estado === 'asignado') stockMap[d.consignatario_id].asignados++
    if (d.estado === 'vendido') stockMap[d.consignatario_id].vendidos++
  }

  // Diferencias pendientes por consignatario
  const difMap: Record<string, { count: number; monto: number }> = {}
  for (const d of diferencias ?? []) {
    if (d.estado !== 'pendiente') continue
    const cid = d.auditorias.consignatario_id
    if (!difMap[cid]) difMap[cid] = { count: 0, monto: 0 }
    difMap[cid].count++
    difMap[cid].monto += d.monto_deuda
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>

      {/* Comisiones por consignatario y mes */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Comisiones por consignatario y mes</h2>
        </div>
        {mesesSorted.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            Sin ventas registradas. Las comisiones se calcularán al sincronizar ventas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Consignatario</th>
                  {mesesSorted.map((m) => (
                    <th key={m} className="text-right px-4 py-3 font-medium text-gray-600">{m}</th>
                  ))}
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {consigs.map((c) => {
                  const row = comisionesMap[c.id] ?? {}
                  const total = Object.values(row).reduce((s, v) => s + v, 0)
                  if (total === 0) return null
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{c.nombre}</td>
                      {mesesSorted.map((m) => (
                        <td key={m} className="px-4 py-3 text-right text-gray-700">
                          {row[m] ? formatearMoneda(row[m]) : '-'}
                        </td>
                      ))}
                      <td className="px-6 py-3 text-right font-bold text-gray-900">{formatearMoneda(total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock por consignatario */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Stock por consignatario</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Consignatario</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Asignados</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Vendidos</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {consigs.map((c) => {
              const s = stockMap[c.id] ?? { asignados: 0, vendidos: 0 }
              const total = s.asignados + s.vendidos
              if (total === 0) return null
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-6 py-3 text-right text-blue-700 font-medium">{s.asignados}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{s.vendidos}</td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">{total}</td>
                </tr>
              )
            })}
            {!consigs.some((c) => stockMap[c.id]) && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">Sin stock asignado</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Diferencias pendientes */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Diferencias pendientes por consignatario</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Consignatario</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Diferencias</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Monto total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {consigs.map((c) => {
              const d = difMap[c.id]
              if (!d) return null
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-6 py-3 text-right text-red-600 font-medium">{d.count}</td>
                  <td className="px-6 py-3 text-right font-bold text-red-700">{formatearMoneda(d.monto)}</td>
                </tr>
              )
            })}
            {!Object.keys(difMap).length && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                  Sin diferencias pendientes
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
git add app/\(admin\)/reportes/page.tsx
git commit -m "feat: add reportes page with commissions, stock, and diferencias"
```

---

### Task 9: Improve Dashboard with commissions and diferencias cards

**Files:**
- Modify: `app/(admin)/dashboard/page.tsx`

- [ ] **Step 1: Update dashboard to add commission and diferencias cards**

Replace the entire content of `app/(admin)/dashboard/page.tsx` with:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { Consignatario, Venta, Diferencia } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = createClient()

  const now = new Date()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [
    { count: totalDispositivos },
    { count: disponibles },
    { count: asignados },
    { count: vendidos },
    { count: totalConsignatarios },
    { count: totalModelos },
    { data: ventas },
    { data: diferencias },
    { data: consignatarios },
  ] = await Promise.all([
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'disponible'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'asignado'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'vendido'),
    supabase.from('consignatarios').select('*', { count: 'exact', head: true }),
    supabase.from('modelos').select('*', { count: 'exact', head: true }),
    supabase.from('ventas').select('consignatario_id, comision_monto, fecha_venta')
      .gte('fecha_venta', mesActual + '-01').returns<Pick<Venta, 'consignatario_id' | 'comision_monto' | 'fecha_venta'>[]>(),
    supabase.from('diferencias').select('*, auditorias(consignatario_id)').eq('estado', 'pendiente')
      .returns<(Diferencia & { auditorias: { consignatario_id: string } })[]>(),
    supabase.from('consignatarios').select('id, nombre').returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  const consigMap = (consignatarios ?? []).reduce<Record<string, string>>((m, c) => { m[c.id] = c.nombre; return m }, {})

  // Comisiones del mes por consignatario
  const comisionesPorConsig: Record<string, number> = {}
  let totalComisiones = 0
  for (const v of ventas ?? []) {
    comisionesPorConsig[v.consignatario_id] = (comisionesPorConsig[v.consignatario_id] ?? 0) + v.comision_monto
    totalComisiones += v.comision_monto
  }

  // Diferencias pendientes
  const difPorConsig: Record<string, number> = {}
  let totalDifMonto = 0
  for (const d of diferencias ?? []) {
    const cid = d.auditorias.consignatario_id
    difPorConsig[cid] = (difPorConsig[cid] ?? 0) + d.monto_deuda
    totalDifMonto += d.monto_deuda
  }

  const stats = [
    { label: 'Dispositivos totales', value: totalDispositivos ?? 0, color: 'text-blue-700' },
    { label: 'Disponibles', value: disponibles ?? 0, color: 'text-green-700' },
    { label: 'Asignados', value: asignados ?? 0, color: 'text-amber-700' },
    { label: 'Vendidos', value: vendidos ?? 0, color: 'text-purple-700' },
    { label: 'Consignatarios', value: totalConsignatarios ?? 0, color: 'text-cyan-700' },
    { label: 'Modelos', value: totalModelos ?? 0, color: 'text-gray-700' },
  ]

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-8">Resumen general del sistema de consignacion</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Comisiones a pagar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Comisiones a pagar — {mesActual}</h2>
            <Link href="/reportes" className="text-xs text-blue-600 hover:underline">Ver reportes →</Link>
          </div>
          {Object.keys(comisionesPorConsig).length === 0 ? (
            <p className="text-sm text-gray-400">Sin ventas este mes</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(comisionesPorConsig).sort((a, b) => b[1] - a[1]).map(([cid, monto]) => (
                <div key={cid} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{consigMap[cid] ?? cid}</span>
                  <span className="font-medium text-gray-900">{formatearMoneda(monto)}</span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-sm font-bold">
                <span>Total</span>
                <span className="text-blue-700">{formatearMoneda(totalComisiones)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Diferencias pendientes */}
        <div className={`rounded-xl border p-5 ${totalDifMonto > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Diferencias pendientes</h2>
            <Link href="/diferencias" className="text-xs text-blue-600 hover:underline">Ver todas →</Link>
          </div>
          {Object.keys(difPorConsig).length === 0 ? (
            <p className="text-sm text-gray-400">Sin diferencias pendientes</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(difPorConsig).sort((a, b) => b[1] - a[1]).map(([cid, monto]) => (
                <div key={cid} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{consigMap[cid] ?? cid}</span>
                  <span className="font-medium text-red-700">{formatearMoneda(monto)}</span>
                </div>
              ))}
              <div className="border-t border-red-100 pt-2 flex items-center justify-between text-sm font-bold">
                <span>Total</span>
                <span className="text-red-700">{formatearMoneda(totalDifMonto)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/dashboard/page.tsx
git commit -m "feat: improve dashboard with commissions and diferencias cards"
```

---

### Task 10: PDF templates for remito and acta de auditoria

**Files:**
- Create: `lib/pdf/remito-asignacion.tsx`
- Create: `lib/pdf/acta-auditoria.tsx`
- Create: `app/api/pdf/remito/[id]/route.tsx`
- Create: `app/api/pdf/auditoria/[id]/route.tsx`

- [ ] **Step 1: Create remito PDF template**

```tsx
// lib/pdf/remito-asignacion.tsx
import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold' },
  subtitle: { fontSize: 10, color: '#666', marginTop: 4 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, fontSize: 10 },
  table: { marginTop: 8 },
  thRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 4, marginBottom: 4 },
  th: { fontWeight: 'bold', fontSize: 9, color: '#333' },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  cell: { fontSize: 9 },
  totalRow: { flexDirection: 'row', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#333' },
  totalLabel: { fontWeight: 'bold', fontSize: 10 },
  totalValue: { fontWeight: 'bold', fontSize: 10 },
  firma: { marginTop: 30 },
  firmaImg: { width: 200, height: 80 },
  firmaLabel: { fontSize: 9, color: '#666', marginTop: 4 },
})

interface RemitoProps {
  fecha: string
  consignatario: string
  firmadoPor: string
  firmaBase64: string
  items: { imei: string; marca: string; modelo: string; precioCosto: number; precioVenta: number }[]
  totalCosto: number
  totalVenta: number
}

export function RemitoAsignacionPDF(props: RemitoProps) {
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>GOcelular — Remito de Asignacion</Text>
          <Text style={s.subtitle}>Entrega de mercaderia en consignacion</Text>
        </View>

        <View style={s.meta}>
          <Text>Fecha: {props.fecha}</Text>
          <Text>Consignatario: {props.consignatario}</Text>
        </View>

        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.th, { width: '30%' }]}>IMEI</Text>
            <Text style={[s.th, { width: '20%' }]}>Marca</Text>
            <Text style={[s.th, { width: '20%' }]}>Modelo</Text>
            <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>P. Costo</Text>
            <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>P. Venta</Text>
          </View>
          {props.items.map((item, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.cell, { width: '30%', fontFamily: 'Courier' }]}>{item.imei}</Text>
              <Text style={[s.cell, { width: '20%' }]}>{item.marca}</Text>
              <Text style={[s.cell, { width: '20%' }]}>{item.modelo}</Text>
              <Text style={[s.cell, { width: '15%', textAlign: 'right' }]}>{fmt(item.precioCosto)}</Text>
              <Text style={[s.cell, { width: '15%', textAlign: 'right' }]}>{fmt(item.precioVenta)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.totalLabel, { width: '70%' }]}>{props.items.length} equipos</Text>
            <Text style={[s.totalValue, { width: '15%', textAlign: 'right' }]}>{fmt(props.totalCosto)}</Text>
            <Text style={[s.totalValue, { width: '15%', textAlign: 'right' }]}>{fmt(props.totalVenta)}</Text>
          </View>
        </View>

        <View style={s.firma}>
          <Text style={{ fontSize: 9, marginBottom: 4 }}>Recibido por: {props.firmadoPor}</Text>
          {props.firmaBase64 && <Image style={s.firmaImg} src={props.firmaBase64} />}
          <Text style={s.firmaLabel}>Firma del consignatario</Text>
        </View>
      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Create acta auditoria PDF template**

```tsx
// lib/pdf/acta-auditoria.tsx
import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold' },
  subtitle: { fontSize: 10, color: '#666', marginTop: 4 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, fontSize: 10 },
  summary: { flexDirection: 'row', gap: 16, marginBottom: 12, fontSize: 10 },
  summaryItem: { padding: 8, borderWidth: 0.5, borderColor: '#ccc', borderRadius: 4 },
  table: { marginTop: 8 },
  thRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 4, marginBottom: 4 },
  th: { fontWeight: 'bold', fontSize: 9, color: '#333' },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  cell: { fontSize: 9 },
  obs: { marginTop: 16, fontSize: 9, color: '#555' },
  firma: { marginTop: 30 },
  firmaImg: { width: 200, height: 80 },
  firmaLabel: { fontSize: 9, color: '#666', marginTop: 4 },
})

interface ActaProps {
  fecha: string
  consignatario: string
  realizadaPor: string
  observaciones: string
  firmaBase64: string
  items: { imei: string; marca: string; modelo: string; presente: boolean }[]
}

export function ActaAuditoriaPDF(props: ActaProps) {
  const presentes = props.items.filter((i) => i.presente).length
  const faltantes = props.items.length - presentes

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>GOcelular — Acta de Auditoria</Text>
          <Text style={s.subtitle}>Verificacion de stock en consignacion</Text>
        </View>

        <View style={s.meta}>
          <Text>Fecha: {props.fecha}</Text>
          <Text>Consignatario: {props.consignatario}</Text>
          <Text>Auditor: {props.realizadaPor}</Text>
        </View>

        <View style={s.summary}>
          <View style={s.summaryItem}><Text>Esperados: {props.items.length}</Text></View>
          <View style={s.summaryItem}><Text>Presentes: {presentes}</Text></View>
          <View style={s.summaryItem}><Text>Faltantes: {faltantes}</Text></View>
        </View>

        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.th, { width: '35%' }]}>IMEI</Text>
            <Text style={[s.th, { width: '20%' }]}>Marca</Text>
            <Text style={[s.th, { width: '25%' }]}>Modelo</Text>
            <Text style={[s.th, { width: '20%', textAlign: 'center' }]}>Estado</Text>
          </View>
          {props.items.map((item, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.cell, { width: '35%', fontFamily: 'Courier' }]}>{item.imei}</Text>
              <Text style={[s.cell, { width: '20%' }]}>{item.marca}</Text>
              <Text style={[s.cell, { width: '25%' }]}>{item.modelo}</Text>
              <Text style={[s.cell, { width: '20%', textAlign: 'center', color: item.presente ? '#16a34a' : '#dc2626' }]}>
                {item.presente ? 'Presente' : 'FALTANTE'}
              </Text>
            </View>
          ))}
        </View>

        {props.observaciones && (
          <View style={s.obs}>
            <Text style={{ fontWeight: 'bold' }}>Observaciones:</Text>
            <Text>{props.observaciones}</Text>
          </View>
        )}

        <View style={s.firma}>
          <Text style={{ fontSize: 9, marginBottom: 4 }}>Firmado por el consignatario</Text>
          {props.firmaBase64 && <Image style={s.firmaImg} src={props.firmaBase64} />}
          <Text style={s.firmaLabel}>Firma</Text>
        </View>
      </Page>
    </Document>
  )
}
```

- [ ] **Step 3: Create PDF API routes**

```tsx
// app/api/pdf/remito/[id]/route.tsx
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { calcularPrecioVenta } from '@/lib/utils'
import { RemitoAsignacionPDF } from '@/lib/pdf/remito-asignacion'
import type { Config, Consignatario, DispositivoConModelo } from '@/lib/types'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: asignacion }, { data: config }] = await Promise.all([
    supabase.from('asignaciones').select('*').eq('id', params.id).single(),
    supabase.from('config').select('*').single<Config>(),
  ])

  if (!asignacion) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: consignatario }, { data: asigItems }] = await Promise.all([
    supabase.from('consignatarios').select('nombre').eq('id', asignacion.consignatario_id).single<Pick<Consignatario, 'nombre'>>(),
    supabase.from('asignacion_items').select('dispositivo_id').eq('asignacion_id', params.id),
  ])

  const deviceIds = (asigItems ?? []).map((ai) => ai.dispositivo_id)
  const { data: dispositivos } = await supabase
    .from('dispositivos').select('*, modelos(*)').in('id', deviceIds).returns<DispositivoConModelo[]>()

  const mult = config?.multiplicador ?? 1.8
  const items = (dispositivos ?? []).map((d) => ({
    imei: d.imei,
    marca: d.modelos.marca,
    modelo: d.modelos.modelo,
    precioCosto: d.modelos.precio_costo,
    precioVenta: calcularPrecioVenta(d.modelos.precio_costo, mult),
  }))

  const buffer = await renderToBuffer(
    RemitoAsignacionPDF({
      fecha: new Date(asignacion.fecha).toLocaleDateString('es-AR'),
      consignatario: consignatario?.nombre ?? '-',
      firmadoPor: asignacion.firmado_por,
      firmaBase64: asignacion.firma_url,
      items,
      totalCosto: asignacion.total_valor_costo,
      totalVenta: asignacion.total_valor_venta,
    })
  )

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="remito-${params.id.slice(0, 8)}.pdf"`,
    },
  })
}
```

```tsx
// app/api/pdf/auditoria/[id]/route.tsx
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { ActaAuditoriaPDF } from '@/lib/pdf/acta-auditoria'
import type { Consignatario, AuditoriaItem, DispositivoConModelo } from '@/lib/types'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: auditoria } = await supabase.from('auditorias').select('*').eq('id', params.id).single()
  if (!auditoria) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: consignatario }, { data: audItems }] = await Promise.all([
    supabase.from('consignatarios').select('nombre').eq('id', auditoria.consignatario_id).single<Pick<Consignatario, 'nombre'>>(),
    supabase.from('auditoria_items').select('*').eq('auditoria_id', params.id).returns<AuditoriaItem[]>(),
  ])

  const deviceIds = (audItems ?? []).map((ai) => ai.dispositivo_id)
  const { data: dispositivos } = await supabase
    .from('dispositivos').select('*, modelos(*)').in('id', deviceIds).returns<DispositivoConModelo[]>()

  const deviceMap = new Map((dispositivos ?? []).map((d) => [d.id, d]))
  const items = (audItems ?? []).map((ai) => {
    const d = deviceMap.get(ai.dispositivo_id)
    return {
      imei: d?.imei ?? '-',
      marca: d?.modelos.marca ?? '-',
      modelo: d?.modelos.modelo ?? '-',
      presente: ai.presente,
    }
  })

  const buffer = await renderToBuffer(
    ActaAuditoriaPDF({
      fecha: new Date(auditoria.fecha).toLocaleDateString('es-AR'),
      consignatario: consignatario?.nombre ?? '-',
      realizadaPor: auditoria.realizada_por,
      observaciones: auditoria.observaciones ?? '',
      firmaBase64: auditoria.firma_url ?? '',
      items,
    })
  )

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="auditoria-${params.id.slice(0, 8)}.pdf"`,
    },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/pdf/ app/api/pdf/
git commit -m "feat: add PDF generation for remito and acta de auditoria"
```

---

### Task 11: Wire PDF links into existing pages

**Files:**
- Modify: `app/(admin)/consignatarios/[id]/page.tsx` (asignacion PDF links)
- Modify: `app/(admin)/auditorias/page.tsx` (auditoria PDF links)

- [ ] **Step 1: Update consignatario detail page to link to PDF API**

In `app/(admin)/consignatarios/[id]/page.tsx`, replace the PDF link cell (line 93-97):

```tsx
// Old:
{a.documento_url && (
  <a href={a.documento_url} target="_blank" rel="noopener noreferrer"
    className="text-blue-600 text-xs hover:underline">PDF</a>
)}

// New:
<a href={`/api/pdf/remito/${a.id}`} target="_blank" rel="noopener noreferrer"
  className="text-blue-600 text-xs hover:underline">PDF</a>
```

- [ ] **Step 2: Update auditorias listing to add PDF link**

In `app/(admin)/auditorias/page.tsx`, change the "Ver detalle" link for confirmed audits to also show a PDF link. Replace the detail link cell:

```tsx
<td className="px-6 py-3 text-right flex gap-2 justify-end">
  {a.estado === 'confirmada' && (
    <a href={`/api/pdf/auditoria/${a.id}`} target="_blank" rel="noopener noreferrer"
      className="text-green-600 hover:text-green-800 text-xs font-medium">PDF</a>
  )}
</td>
```

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/consignatarios/\[id\]/page.tsx app/\(admin\)/auditorias/page.tsx
git commit -m "feat: wire PDF links for remitos and auditorias"
```

---

### Task 12: Add numero autoincrement to notas_pedidos (DB migration)

The `notas_pedidos` table from the proveedores project is missing a `numero` autoincrement sequence. Run this via Management API:

- [ ] **Step 1: Add sequence for auditoria numbering**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/rnjxmmcsxmyaktseegvt/database/query" \
  -H "Authorization: Bearer sbp_08c69410a4816b8dce7e13be33f65ec3a96a095d" \
  -H "Content-Type: application/json" \
  -d '{"query": "DO $$ BEGIN ALTER TABLE auditorias ADD COLUMN IF NOT EXISTS numero SERIAL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;"}'
```

- [ ] **Step 2: Verify**

Query the table to confirm the column exists.

- [ ] **Step 3: No commit needed (DB-only change)**

---

### Task 13: Final verification

- [ ] **Step 1: Verify all pages load without errors**

Navigate to each URL and confirm no 404 or runtime errors:
- http://localhost:3000/dashboard
- http://localhost:3000/asignar
- http://localhost:3000/auditorias
- http://localhost:3000/auditorias/nueva
- http://localhost:3000/diferencias
- http://localhost:3000/reportes

- [ ] **Step 2: Test the full flow**

1. Import some devices via CSV in /inventario
2. Create a consignatario in /consignatarios
3. Assign devices in /asignar (select devices, sign, submit)
4. Create audit in /auditorias/nueva (scan IMEIs, sign, confirm)
5. Check /diferencias for any generated discrepancies
6. Verify /dashboard shows updated stats
7. Download PDF from consignatario detail page

- [ ] **Step 3: Final commit if any fixes were needed**
