# Pagos Mayoristas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable fast payment registration for wholesale clients via image-based OCR extraction, integrated with cuenta corriente and flujo de fondos.

**Architecture:** New Supabase table `pagos_mayoristas` stores payments. API route `/api/extraer-pago` uses Claude Vision to extract data from payment images. Payments appear as "Haber" in cuenta corriente and as `in_mayoristas` column in flujo de fondos. Risk exposure dashboard tracks limits per client.

**Tech Stack:** Next.js App Router, Supabase (DB + Storage), Anthropic SDK (Claude Vision), TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260717_pagos_mayoristas.sql` | Create | Schema: pagos_mayoristas table + limite_cuenta_corriente column |
| `lib/types.ts` | Modify | Add PagoMayorista interface, update ClienteMayorista |
| `lib/actions/pagos-mayoristas.ts` | Create | Server actions: CRUD pagos, risk exposure queries, limit validation |
| `app/api/extraer-pago/route.ts` | Create | API route: receive image, call Claude Vision, return extracted data |
| `app/(admin)/mayoristas/clientes/pagos/page.tsx` | Create | Server page: fetch data, render PagosClient |
| `app/(admin)/mayoristas/clientes/pagos/PagosClient.tsx` | Create | Client component: tabs, upload, form, risk table |
| `app/(admin)/mayoristas/clientes/page.tsx` | Modify | Enable Pagos card |
| `app/(admin)/mayoristas/clientes/cuenta-corriente/page.tsx` | Modify | Pass pagos data to CuentaCorrienteClient |
| `app/(admin)/mayoristas/clientes/cuenta-corriente/CuentaCorrienteClient.tsx` | Modify | Integrate haber rows from pagos |
| `lib/actions/finanzas.ts` | Modify | Add in_mayoristas to FlujoDiario, fetch and merge pagos |
| `app/(admin)/finanzas/page.tsx` | Modify | Add "May" column to flujo table |
| `lib/actions/proformas.ts` | Modify | Add limit check to confirmarProforma() |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260717_pagos_mayoristas.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Tabla de pagos mayoristas
CREATE TABLE pagos_mayoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_mayorista_id uuid NOT NULL REFERENCES clientes_mayoristas(id),
  monto numeric NOT NULL,
  fecha_cobro date NOT NULL,
  cuit_emisor text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('echeq', 'transferencia', 'efectivo', 'orden_pago')),
  comprobante_url text,
  confianza_extraccion numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pagos_mayoristas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on pagos_mayoristas"
  ON pagos_mayoristas FOR ALL
  USING (true) WITH CHECK (true);

-- Agregar límite de cuenta corriente a clientes mayoristas
ALTER TABLE clientes_mayoristas
  ADD COLUMN IF NOT EXISTS limite_cuenta_corriente numeric;
```

- [ ] **Step 2: Create the storage bucket**

Run in Supabase SQL Editor or via the dashboard:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes-mayoristas', 'comprobantes-mayoristas', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin upload comprobantes" ON storage.objects
  FOR ALL USING (bucket_id = 'comprobantes-mayoristas')
  WITH CHECK (bucket_id = 'comprobantes-mayoristas');
```

- [ ] **Step 3: Run migration against Supabase**

```bash
cd /home/cremi/consignacion-app
npx supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717_pagos_mayoristas.sql
git commit -m "feat: add pagos_mayoristas table and limite_cuenta_corriente column"
```

---

### Task 2: Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add PagoMayorista interface and update ClienteMayorista**

In `lib/types.ts`, add after the `ClienteMayorista` interface (around line 165):

```typescript
export interface PagoMayorista {
  id: string
  cliente_mayorista_id: string
  monto: number
  fecha_cobro: string
  cuit_emisor: string
  tipo: 'echeq' | 'transferencia' | 'efectivo' | 'orden_pago'
  comprobante_url: string | null
  confianza_extraccion: number | null
  created_at: string
}

export interface ExtraccionPago {
  monto: number | null
  fecha_cobro: string | null
  cuit_emisor: string | null
  confianza: number
  tipo_detectado: 'echeq' | 'transferencia' | 'efectivo' | 'orden_pago' | null
}

export interface ExposicionRiesgo {
  cliente_id: string
  nombre_comercial: string
  limite_cc: number | null
  deuda: number
  pagos_acreditados: number
  pendiente_cobro: number
  saldo: number
  porcentaje_utilizacion: number | null
  estado: 'verde' | 'amarillo' | 'rojo' | 'bloqueado'
}
```

Also update the `ClienteMayorista` interface to include the new field. Find:

```typescript
export interface ClienteMayorista {
  id: string
  nombre_comercial: string
  razon_social: string | null
  condicion_iva: CondicionIVA
  cuit: string | null
  telefono: string | null
  email: string | null
  direccion_entrega: string | null
  transporte: string | null
  created_at: string
}
```

Replace with:

```typescript
export interface ClienteMayorista {
  id: string
  nombre_comercial: string
  razon_social: string | null
  condicion_iva: CondicionIVA
  cuit: string | null
  telefono: string | null
  email: string | null
  direccion_entrega: string | null
  transporte: string | null
  limite_cuenta_corriente: number | null
  created_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add PagoMayorista, ExtraccionPago and ExposicionRiesgo types"
```

---

### Task 3: Server actions for pagos

**Files:**
- Create: `lib/actions/pagos-mayoristas.ts`

- [ ] **Step 1: Create the server actions file**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { PagoMayorista, ExposicionRiesgo } from '@/lib/types'

// ---------------------------------------------------------------------------
// Asentar pago
// ---------------------------------------------------------------------------

export async function asentarPago(input: {
  cliente_mayorista_id: string
  monto: number
  fecha_cobro: string
  cuit_emisor: string
  tipo: 'echeq' | 'transferencia' | 'efectivo' | 'orden_pago'
  comprobante_url?: string | null
  confianza_extraccion?: number | null
}) {
  const supabase = createAdminClient()

  const { error } = await supabase.from('pagos_mayoristas').insert({
    cliente_mayorista_id: input.cliente_mayorista_id,
    monto: input.monto,
    fecha_cobro: input.fecha_cobro,
    cuit_emisor: input.cuit_emisor,
    tipo: input.tipo,
    comprobante_url: input.comprobante_url ?? null,
    confianza_extraccion: input.confianza_extraccion ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath('/mayoristas/clientes/pagos')
  revalidatePath('/mayoristas/clientes/cuenta-corriente')
  revalidatePath('/finanzas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Obtener pagos de un cliente
// ---------------------------------------------------------------------------

export async function getPagosByCliente(clienteId: string): Promise<PagoMayorista[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagos_mayoristas')
    .select('*')
    .eq('cliente_mayorista_id', clienteId)
    .order('fecha_cobro', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as PagoMayorista[]
}

// ---------------------------------------------------------------------------
// Obtener todos los pagos (para flujo de fondos)
// ---------------------------------------------------------------------------

export async function getAllPagos(): Promise<PagoMayorista[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagos_mayoristas')
    .select('*')
    .order('fecha_cobro', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as PagoMayorista[]
}

// ---------------------------------------------------------------------------
// Subir comprobante a Storage
// ---------------------------------------------------------------------------

export async function subirComprobante(
  clienteId: string,
  file: File
): Promise<string> {
  const supabase = createAdminClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${clienteId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('comprobantes-mayoristas')
    .upload(path, file)

  if (error) throw new Error(error.message)

  const { data: urlData } = supabase.storage
    .from('comprobantes-mayoristas')
    .getPublicUrl(path)

  return urlData.publicUrl
}

// ---------------------------------------------------------------------------
// Buscar cliente por CUIT
// ---------------------------------------------------------------------------

export async function getClienteByCuit(cuit: string): Promise<{ id: string; nombre_comercial: string } | null> {
  const supabase = createAdminClient()
  // Normalize: remove dashes for comparison
  const cuitNorm = cuit.replace(/-/g, '')
  const { data } = await supabase
    .from('clientes_mayoristas')
    .select('id, nombre_comercial, cuit')

  if (!data) return null
  const match = data.find(c => c.cuit && c.cuit.replace(/-/g, '') === cuitNorm)
  return match ? { id: match.id, nombre_comercial: match.nombre_comercial } : null
}

// ---------------------------------------------------------------------------
// Exposición al riesgo
// ---------------------------------------------------------------------------

export async function getExposicionRiesgo(): Promise<ExposicionRiesgo[]> {
  const supabase = createAdminClient()

  const [{ data: clientes }, { data: proformas }, { data: pagos }] = await Promise.all([
    supabase.from('clientes_mayoristas').select('id, nombre_comercial, limite_cuenta_corriente'),
    supabase.from('proformas').select('cliente_mayorista_id, total_con_iva').eq('estado', 'confirmada').not('cliente_mayorista_id', 'is', null),
    supabase.from('pagos_mayoristas').select('cliente_mayorista_id, monto, fecha_cobro'),
  ])

  if (!clientes) return []

  const hoy = new Date().toISOString().slice(0, 10)

  return clientes.map(c => {
    const deuda = (proformas ?? [])
      .filter(p => p.cliente_mayorista_id === c.id)
      .reduce((s, p) => s + (p.total_con_iva || 0), 0)

    const pagosCliente = (pagos ?? []).filter(p => p.cliente_mayorista_id === c.id)

    const pagos_acreditados = pagosCliente
      .filter(p => p.fecha_cobro <= hoy)
      .reduce((s, p) => s + (p.monto || 0), 0)

    const pendiente_cobro = pagosCliente
      .filter(p => p.fecha_cobro > hoy)
      .reduce((s, p) => s + (p.monto || 0), 0)

    const saldo = deuda - pagos_acreditados - pendiente_cobro
    const limite = c.limite_cuenta_corriente
    const pct = limite && limite > 0 ? (saldo / limite) * 100 : null

    let estado: ExposicionRiesgo['estado'] = 'verde'
    if (pct !== null) {
      if (pct >= 100) estado = 'bloqueado'
      else if (pct > 90) estado = 'rojo'
      else if (pct > 70) estado = 'amarillo'
    }

    return {
      cliente_id: c.id,
      nombre_comercial: c.nombre_comercial,
      limite_cc: limite,
      deuda,
      pagos_acreditados,
      pendiente_cobro,
      saldo,
      porcentaje_utilizacion: pct !== null ? Math.round(pct) : null,
      estado,
    }
  })
}

// ---------------------------------------------------------------------------
// Verificar límite de CC (usado antes de confirmar proforma)
// ---------------------------------------------------------------------------

export async function verificarLimiteCC(
  clienteId: string,
  montoNuevaProforma: number
): Promise<{ permitido: boolean; mensaje?: string }> {
  const supabase = createAdminClient()

  const { data: cliente } = await supabase
    .from('clientes_mayoristas')
    .select('nombre_comercial, limite_cuenta_corriente')
    .eq('id', clienteId)
    .single()

  if (!cliente || !cliente.limite_cuenta_corriente) return { permitido: true }

  const { data: proformas } = await supabase
    .from('proformas')
    .select('total_con_iva')
    .eq('cliente_mayorista_id', clienteId)
    .eq('estado', 'confirmada')

  const { data: pagos } = await supabase
    .from('pagos_mayoristas')
    .select('monto')
    .eq('cliente_mayorista_id', clienteId)

  const deuda = (proformas ?? []).reduce((s, p) => s + (p.total_con_iva || 0), 0)
  const totalPagos = (pagos ?? []).reduce((s, p) => s + (p.monto || 0), 0)
  const saldoActual = deuda - totalPagos
  const saldoConNueva = saldoActual + montoNuevaProforma
  const limite = cliente.limite_cuenta_corriente

  if (saldoConNueva > limite) {
    return {
      permitido: false,
      mensaje: `Cliente ${cliente.nombre_comercial} excede su límite de cuenta corriente ($${Math.round(saldoActual).toLocaleString()}+$${Math.round(montoNuevaProforma).toLocaleString()} / $${Math.round(limite).toLocaleString()})`,
    }
  }

  return { permitido: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/pagos-mayoristas.ts
git commit -m "feat: add pagos-mayoristas server actions (CRUD, risk, limit check)"
```

---

### Task 4: API route for image extraction

**Files:**
- Create: `app/api/extraer-pago/route.ts`

- [ ] **Step 1: Install Anthropic SDK**

```bash
cd /home/cremi/consignacion-app
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add ANTHROPIC_API_KEY to .env.local**

```bash
echo "ANTHROPIC_API_KEY=your-key-here" >> .env.local
```

Replace `your-key-here` with the actual API key.

- [ ] **Step 3: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('imagen') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se envió imagen' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const mimeType = file.type || 'image/jpeg'

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Analizá esta imagen de un comprobante de pago argentino (puede ser un echeq, cheque, orden de pago, o transferencia bancaria).

Extraé los siguientes datos:
1. Monto (número, sin símbolo de moneda)
2. Fecha de cobro o fecha de pago (formato YYYY-MM-DD)
3. CUIT del emisor (formato XX-XXXXXXXX-X)
4. Tipo de comprobante: "echeq", "transferencia", "efectivo", u "orden_pago"

Respondé ÚNICAMENTE con un JSON válido, sin markdown, sin texto adicional:
{
  "monto": <numero o null>,
  "fecha_cobro": "<YYYY-MM-DD o null>",
  "cuit_emisor": "<XX-XXXXXXXX-X o null>",
  "tipo_detectado": "<echeq|transferencia|efectivo|orden_pago o null>",
  "confianza": <numero entre 0 y 1>
}

Si no podés extraer un campo, poné null. La confianza es tu nivel de certeza general (0 = nada seguro, 1 = totalmente seguro).`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text)

    return NextResponse.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/extraer-pago/route.ts package.json package-lock.json
git commit -m "feat: add /api/extraer-pago route with Claude Vision extraction"
```

---

### Task 5: Pagos page and client component

**Files:**
- Create: `app/(admin)/mayoristas/clientes/pagos/page.tsx`
- Create: `app/(admin)/mayoristas/clientes/pagos/PagosClient.tsx`

- [ ] **Step 1: Create the server page**

`app/(admin)/mayoristas/clientes/pagos/page.tsx`:

```typescript
export const dynamic = 'force-dynamic'

import { getClientesMayoristas } from '@/lib/actions/clientes-mayoristas'
import { getExposicionRiesgo } from '@/lib/actions/pagos-mayoristas'
import Link from 'next/link'
import PagosClient from './PagosClient'

export default async function PagosPage() {
  const [clientes, exposicion] = await Promise.all([
    getClientesMayoristas(),
    getExposicionRiesgo(),
  ])

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <Link href="/mayoristas/clientes" className="text-gray-400 hover:text-gray-600">← Clientes</Link>
        <h1 className="text-2xl font-bold text-gray-900">Pagos</h1>
      </div>
      <PagosClient clientes={clientes} exposicion={exposicion} />
    </div>
  )
}
```

- [ ] **Step 2: Create the client component with both tabs**

`app/(admin)/mayoristas/clientes/pagos/PagosClient.tsx`:

```tsx
'use client'

import { useState, useRef } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { asentarPago } from '@/lib/actions/pagos-mayoristas'
import type { ClienteMayorista, ExtraccionPago, ExposicionRiesgo } from '@/lib/types'

interface Props {
  clientes: ClienteMayorista[]
  exposicion: ExposicionRiesgo[]
}

type Tab = 'asentar' | 'riesgo'

export default function PagosClient({ clientes, exposicion }: Props) {
  const [tab, setTab] = useState<Tab>('asentar')

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('asentar')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'asentar' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Asentar Pago
        </button>
        <button
          onClick={() => setTab('riesgo')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'riesgo' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Exposición al Riesgo
        </button>
      </div>

      {tab === 'asentar' ? (
        <AsentarPagoTab clientes={clientes} />
      ) : (
        <RiesgoTab exposicion={exposicion} />
      )}
    </div>
  )
}

// ==========================================================================
// Asentar Pago Tab
// ==========================================================================

function AsentarPagoTab({ clientes }: { clientes: ClienteMayorista[] }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [extraccion, setExtraccion] = useState<ExtraccionPago | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  // Form state
  const [clienteId, setClienteId] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaCobro, setFechaCobro] = useState('')
  const [cuitEmisor, setCuitEmisor] = useState('')
  const [tipo, setTipo] = useState<'echeq' | 'transferencia' | 'efectivo' | 'orden_pago'>('echeq')
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // Default fecha_cobro to today for transferencia/efectivo
  function handleTipoChange(nuevoTipo: typeof tipo) {
    setTipo(nuevoTipo)
    if ((nuevoTipo === 'transferencia' || nuevoTipo === 'efectivo') && !fechaCobro) {
      setFechaCobro(new Date().toISOString().slice(0, 10))
    }
  }
  const [saving, setSaving] = useState(false)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setLoading(true)
    setMensaje(null)

    try {
      const formData = new FormData()
      formData.append('imagen', f)
      const res = await fetch('/api/extraer-pago', { method: 'POST', body: formData })
      const data: ExtraccionPago = await res.json()
      setExtraccion(data)

      // Pre-fill form
      if (data.monto !== null) setMonto(String(data.monto))
      if (data.fecha_cobro) setFechaCobro(data.fecha_cobro)
      if (data.cuit_emisor) setCuitEmisor(data.cuit_emisor)
      if (data.tipo_detectado) setTipo(data.tipo_detectado)

      // Auto-match client by CUIT
      if (data.cuit_emisor) {
        const cuitNorm = data.cuit_emisor.replace(/-/g, '')
        const match = clientes.find(c => c.cuit && c.cuit.replace(/-/g, '') === cuitNorm)
        if (match) setClienteId(match.id)
      }

      // If high confidence, auto-submit
      if (data.confianza >= 0.85 && data.monto && data.fecha_cobro && data.cuit_emisor) {
        const cuitNorm = data.cuit_emisor.replace(/-/g, '')
        const match = clientes.find(c => c.cuit && c.cuit.replace(/-/g, '') === cuitNorm)
        if (match) {
          await submitPago({
            clienteId: match.id,
            monto: data.monto,
            fechaCobro: data.fecha_cobro,
            cuitEmisor: data.cuit_emisor,
            tipo: data.tipo_detectado || 'echeq',
            file: f,
            confianza: data.confianza,
          })
        }
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error al procesar la imagen' })
    } finally {
      setLoading(false)
    }
  }

  async function submitPago(override?: {
    clienteId: string
    monto: number
    fechaCobro: string
    cuitEmisor: string
    tipo: 'echeq' | 'transferencia' | 'efectivo' | 'orden_pago'
    file: File | null
    confianza: number | null
  }) {
    const cId = override?.clienteId ?? clienteId
    const m = override?.monto ?? Number(monto)
    const fc = override?.fechaCobro ?? fechaCobro
    const cuit = override?.cuitEmisor ?? cuitEmisor
    const t = override?.tipo ?? tipo
    const f = override?.file ?? file
    const conf = override?.confianza ?? extraccion?.confianza ?? null

    if (!cId || !m || !fc || !cuit) {
      setMensaje({ tipo: 'error', texto: 'Completá todos los campos obligatorios' })
      return
    }

    setSaving(true)
    setMensaje(null)

    try {
      // Upload image if present
      let comprobanteUrl: string | null = null
      if (f) {
        const uploadForm = new FormData()
        uploadForm.append('file', f)
        uploadForm.append('clienteId', cId)
        // Upload via server action workaround: direct supabase upload
        const supabase = (await import('@/lib/supabase/client')).createClient()
        const ext = f.name.split('.').pop() || 'jpg'
        const path = `${cId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('comprobantes-mayoristas')
          .upload(path, f)
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from('comprobantes-mayoristas')
            .getPublicUrl(path)
          comprobanteUrl = urlData.publicUrl
        }
      }

      const result = await asentarPago({
        cliente_mayorista_id: cId,
        monto: m,
        fecha_cobro: fc,
        cuit_emisor: cuit,
        tipo: t,
        comprobante_url: comprobanteUrl,
        confianza_extraccion: conf,
      })

      if ('error' in result) {
        setMensaje({ tipo: 'error', texto: result.error! })
      } else {
        setMensaje({ tipo: 'ok', texto: `Pago de ${formatearMoneda(m)} asentado correctamente` })
        // Reset form
        setClienteId('')
        setMonto('')
        setFechaCobro('')
        setCuitEmisor('')
        setTipo('echeq')
        setFile(null)
        setPreview(null)
        setExtraccion(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error al asentar el pago' })
    } finally {
      setSaving(false)
    }
  }

  const needsConfirmation = extraccion && extraccion.confianza < 0.85

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Upload zone */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Subir comprobante</h3>
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition"
        >
          {preview ? (
            <img src={preview} alt="Comprobante" className="max-h-48 mx-auto rounded-lg" />
          ) : (
            <div className="text-gray-400">
              <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Click o arrastrá una imagen</p>
              <p className="text-xs text-gray-300 mt-1">Echeq, orden de pago, transferencia</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        {loading && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Extrayendo datos...
          </div>
        )}
        {extraccion && !loading && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
            <p>Confianza: <span className={`font-bold ${extraccion.confianza >= 0.85 ? 'text-green-600' : 'text-amber-600'}`}>{Math.round(extraccion.confianza * 100)}%</span></p>
            {extraccion.confianza >= 0.85 && <p className="text-green-600 font-medium">✓ Asentado automáticamente</p>}
            {needsConfirmation && <p className="text-amber-600 font-medium">⚠ Revisá los datos y confirmá</p>}
          </div>
        )}
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">
          {needsConfirmation ? 'Confirmar datos extraídos' : 'Datos del pago'}
        </h3>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Cliente *</label>
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Seleccionar...</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre_comercial} {c.cuit ? `(${c.cuit})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Monto *</label>
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Fecha de cobro *</label>
            <input
              type="date"
              value={fechaCobro}
              onChange={e => setFechaCobro(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">CUIT emisor *</label>
            <input
              type="text"
              value={cuitEmisor}
              onChange={e => setCuitEmisor(e.target.value)}
              placeholder="XX-XXXXXXXX-X"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={e => handleTipoChange(e.target.value as typeof tipo)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="echeq">Echeq</option>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="orden_pago">Orden de Pago</option>
            </select>
          </div>
        </div>

        {mensaje && (
          <div className={`p-3 rounded-lg text-sm ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {mensaje.texto}
          </div>
        )}

        <button
          onClick={() => submitPago()}
          disabled={saving || !clienteId || !monto || !fechaCobro || !cuitEmisor}
          className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saving ? 'Asentando...' : 'Asentar Pago'}
        </button>
      </div>
    </div>
  )
}

// ==========================================================================
// Riesgo Tab
// ==========================================================================

function RiesgoTab({ exposicion }: { exposicion: ExposicionRiesgo[] }) {
  const [filtro, setFiltro] = useState<'todos' | 'verde' | 'amarillo' | 'rojo' | 'bloqueado'>('todos')
  const [expandido, setExpandido] = useState<string | null>(null)

  const filtered = filtro === 'todos'
    ? exposicion
    : exposicion.filter(e => e.estado === filtro)

  const estadoColor = {
    verde: 'bg-green-100 text-green-800',
    amarillo: 'bg-yellow-100 text-yellow-800',
    rojo: 'bg-red-100 text-red-800',
    bloqueado: 'bg-gray-900 text-white',
  }

  const barColor = {
    verde: 'bg-green-500',
    amarillo: 'bg-yellow-500',
    rojo: 'bg-red-500',
    bloqueado: 'bg-gray-900',
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['todos', 'verde', 'amarillo', 'rojo', 'bloqueado'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
              filtro === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Límite CC</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Deuda</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Acreditado</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Pendiente</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Saldo</th>
              <th className="px-4 py-3 font-medium text-gray-600 w-32">Utilización</th>
              <th className="px-4 py-3 font-medium text-gray-600 w-24">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No hay clientes con este estado
                </td>
              </tr>
            ) : (
              filtered.map(e => (
                <tr
                  key={e.cliente_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandido(expandido === e.cliente_id ? null : e.cliente_id)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{e.nombre_comercial}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {e.limite_cc ? formatearMoneda(e.limite_cc) : 'Sin límite'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatearMoneda(e.deuda)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-600">{formatearMoneda(e.pagos_acreditados)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-600">{formatearMoneda(e.pendiente_cobro)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">{formatearMoneda(e.saldo)}</td>
                  <td className="px-4 py-3">
                    {e.porcentaje_utilizacion !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor[e.estado]}`}
                            style={{ width: `${Math.min(e.porcentaje_utilizacion, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{e.porcentaje_utilizacion}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${estadoColor[e.estado]}`}>
                      {e.estado}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/mayoristas/clientes/pagos/page.tsx app/\(admin\)/mayoristas/clientes/pagos/PagosClient.tsx
git commit -m "feat: add Pagos page with Asentar Pago and Exposición al Riesgo tabs"
```

---

### Task 6: Enable Pagos card in clientes page

**Files:**
- Modify: `app/(admin)/mayoristas/clientes/page.tsx`

- [ ] **Step 1: Update the Pagos card**

In `app/(admin)/mayoristas/clientes/page.tsx`, find:

```typescript
    {
      href: '#',
      title: 'Pagos',
      description: 'Registrar pagos y cancelaciones',
      color: 'blue',
      iconPath: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
      disabled: true,
    },
```

Replace with:

```typescript
    {
      href: '/mayoristas/clientes/pagos',
      title: 'Pagos',
      description: 'Registrar pagos y cancelaciones',
      color: 'blue',
      iconPath: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    },
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/mayoristas/clientes/page.tsx
git commit -m "feat: enable Pagos card in mayoristas clientes page"
```

---

### Task 7: Integrate pagos into Cuenta Corriente

**Files:**
- Modify: `app/(admin)/mayoristas/clientes/cuenta-corriente/page.tsx`
- Modify: `app/(admin)/mayoristas/clientes/cuenta-corriente/CuentaCorrienteClient.tsx`

- [ ] **Step 1: Update server page to pass pagos data**

In `app/(admin)/mayoristas/clientes/cuenta-corriente/page.tsx`, replace the full file with:

```typescript
export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { getClientesMayoristas } from '@/lib/actions/clientes-mayoristas'
import Link from 'next/link'
import CuentaCorrienteClient from './CuentaCorrienteClient'

export default async function CuentaCorrientePage() {
  const clientes = await getClientesMayoristas()
  const admin = createAdminClient()

  const [{ data: proformas }, { data: pagos }] = await Promise.all([
    admin
      .from('proformas')
      .select('id, nro_proforma, cliente_mayorista_id, cliente_nombre, total_con_iva, fecha_confirmacion, estado')
      .eq('estado', 'confirmada')
      .not('cliente_mayorista_id', 'is', null)
      .order('fecha_confirmacion', { ascending: false }),
    admin
      .from('pagos_mayoristas')
      .select('id, cliente_mayorista_id, monto, fecha_cobro, tipo, cuit_emisor, created_at')
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <Link href="/mayoristas/clientes" className="text-gray-400 hover:text-gray-600">← Clientes</Link>
        <h1 className="text-2xl font-bold text-gray-900">Cuenta Corriente</h1>
      </div>

      <CuentaCorrienteClient
        clientes={clientes}
        proformas={(proformas ?? []) as { id: string; nro_proforma: number | null; cliente_mayorista_id: string; cliente_nombre: string; total_con_iva: number; fecha_confirmacion: string; estado: string }[]}
        pagos={(pagos ?? []) as { id: string; cliente_mayorista_id: string; monto: number; fecha_cobro: string; tipo: string; cuit_emisor: string; created_at: string }[]}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update CuentaCorrienteClient to show haber rows**

Replace the full content of `app/(admin)/mayoristas/clientes/cuenta-corriente/CuentaCorrienteClient.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { formatearMoneda } from '@/lib/utils'
import type { ClienteMayorista } from '@/lib/types'

interface ProformaCC {
  id: string
  nro_proforma: number | null
  cliente_mayorista_id: string
  cliente_nombre: string
  total_con_iva: number
  fecha_confirmacion: string
  estado: string
}

interface PagoCC {
  id: string
  cliente_mayorista_id: string
  monto: number
  fecha_cobro: string
  tipo: string
  cuit_emisor: string
  created_at: string
}

interface Props {
  clientes: ClienteMayorista[]
  proformas: ProformaCC[]
  pagos?: PagoCC[]
}

interface Movimiento {
  id: string
  fecha: string
  concepto: string
  tipo: 'debe' | 'haber'
  monto: number
  saldo: number
}

export default function CuentaCorrienteClient({ clientes, proformas, pagos = [] }: Props) {
  const [clienteId, setClienteId] = useState('')

  const proformasCliente = clienteId
    ? proformas.filter(p => p.cliente_mayorista_id === clienteId)
    : []

  const pagosCliente = clienteId
    ? pagos.filter(p => p.cliente_mayorista_id === clienteId)
    : []

  // Build unified movements sorted by date
  const movimientosRaw: Omit<Movimiento, 'saldo'>[] = [
    ...proformasCliente.map(p => ({
      id: p.id,
      fecha: p.fecha_confirmacion,
      concepto: `Proforma N° ${p.nro_proforma || '—'}`,
      tipo: 'debe' as const,
      monto: p.total_con_iva,
    })),
    ...pagosCliente.map(p => ({
      id: p.id,
      fecha: p.created_at,
      concepto: `Pago ${p.tipo} (${p.cuit_emisor})`,
      tipo: 'haber' as const,
      monto: p.monto,
    })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())

  let saldoAcumulado = 0
  const movimientos: Movimiento[] = movimientosRaw.map(m => {
    saldoAcumulado += m.tipo === 'debe' ? m.monto : -m.monto
    return { ...m, saldo: saldoAcumulado }
  })

  const totalDebe = movimientos.reduce((s, m) => s + (m.tipo === 'debe' ? m.monto : 0), 0)
  const totalHaber = movimientos.reduce((s, m) => s + (m.tipo === 'haber' ? m.monto : 0), 0)

  const clienteSeleccionado = clientes.find(c => c.id === clienteId)

  return (
    <div className="space-y-6">
      {/* Selector de cliente */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="text-sm font-medium text-gray-700 block mb-2">Seleccionar cliente</label>
        <select
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
        >
          <option value="">Seleccionar cliente...</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>{c.nombre_comercial}</option>
          ))}
        </select>
      </div>

      {clienteId && (
        <>
          {/* Info del cliente */}
          {clienteSeleccionado && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-3 flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-500">Cliente:</span>{' '}
                <span className="font-semibold text-gray-900">{clienteSeleccionado.nombre_comercial}</span>
              </div>
              {clienteSeleccionado.cuit && (
                <div>
                  <span className="text-gray-500">CUIT:</span>{' '}
                  <span className="font-mono text-gray-700">{clienteSeleccionado.cuit}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Saldo actual:</span>{' '}
                <span className={`font-bold ${saldoAcumulado > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatearMoneda(saldoAcumulado)}
                </span>
              </div>
            </div>
          )}

          {/* Tabla cuenta corriente */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Concepto</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Debe</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Haber</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No hay movimientos para este cliente
                    </td>
                  </tr>
                ) : (
                  movimientos.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(m.fecha).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{m.concepto}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-600 tabular-nums">
                        {m.tipo === 'debe' ? formatearMoneda(m.monto) : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 tabular-nums">
                        {m.tipo === 'haber' ? formatearMoneda(m.monto) : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        <span className={m.saldo > 0 ? 'text-red-600' : 'text-green-600'}>
                          {formatearMoneda(m.saldo)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {movimientos.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-bold text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 tabular-nums">
                      {formatearMoneda(totalDebe)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-600 tabular-nums">
                      {formatearMoneda(totalHaber)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      <span className={saldoAcumulado > 0 ? 'text-red-600' : 'text-green-600'}>
                        {formatearMoneda(saldoAcumulado)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/mayoristas/clientes/cuenta-corriente/page.tsx app/\(admin\)/mayoristas/clientes/cuenta-corriente/CuentaCorrienteClient.tsx
git commit -m "feat: integrate pagos as haber rows in cuenta corriente"
```

---

### Task 8: Integrate pagos into Flujo de Fondos

**Files:**
- Modify: `lib/actions/finanzas.ts`
- Modify: `app/(admin)/finanzas/page.tsx`

- [ ] **Step 1: Add in_mayoristas to FlujoDiario interface**

In `lib/actions/finanzas.ts`, find:

```typescript
interface FlujoDiario {
  cash_date: string
  in_adelantado: number
  in_en_termino: number
  in_atrasado: number
  in_pendiente: number
  in_vencida: number
  in_asistencia: number
  in_proyectado: number
```

Replace with:

```typescript
interface FlujoDiario {
  cash_date: string
  in_adelantado: number
  in_en_termino: number
  in_atrasado: number
  in_pendiente: number
  in_vencida: number
  in_asistencia: number
  in_mayoristas: number
  in_proyectado: number
```

- [ ] **Step 2: Add in_mayoristas: 0 to emptyRow**

In `lib/actions/finanzas.ts`, find the `emptyRow` function. Add `in_mayoristas: 0,` after `in_asistencia: 0,`:

Find:

```typescript
    in_asistencia: 0,
    in_proyectado: 0,
```

Replace with:

```typescript
    in_asistencia: 0,
    in_mayoristas: 0,
    in_proyectado: 0,
```

- [ ] **Step 3: Add fetchPagosMayoristasParaFlujo function**

In `lib/actions/finanzas.ts`, add this function before `fetchFlujoDeFondos`:

```typescript
async function fetchPagosMayoristasParaFlujo(): Promise<{ cash_date: string; in_mayoristas: number }[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagos_mayoristas')
    .select('fecha_cobro, monto')

  if (error || !data) return []

  const byDate = new Map<string, number>()
  for (const row of data) {
    const date = row.fecha_cobro
    byDate.set(date, (byDate.get(date) || 0) + row.monto)
  }

  return Array.from(byDate.entries()).map(([cash_date, in_mayoristas]) => ({
    cash_date,
    in_mayoristas,
  }))
}
```

- [ ] **Step 4: Merge pagos into fetchFlujoDeFondos**

In `fetchFlujoDeFondos()`, update the parallel fetch to include pagos. Find:

```typescript
  const [income, vta3ero, asistencias, egresos, baseDiario] = await Promise.all([
    fetchIncomeFromGocelular(),
    fetchVta3eroFromGocuotas(),
    fetchAsistenciasFromSupabase(),
    fetchEgresosFromSupabase(),
    getProyeccionDiaria(),
  ])
```

Replace with:

```typescript
  const [income, vta3ero, asistencias, egresos, baseDiario, pagosMay] = await Promise.all([
    fetchIncomeFromGocelular(),
    fetchVta3eroFromGocuotas(),
    fetchAsistenciasFromSupabase(),
    fetchEgresosFromSupabase(),
    getProyeccionDiaria(),
    fetchPagosMayoristasParaFlujo(),
  ])
```

Then, after the "Merge vta3ero" block (after line 532), add:

```typescript
  // Merge pagos mayoristas
  for (const r of pagosMay) {
    const row = getOrCreate(map, r.cash_date)
    row.in_mayoristas += r.in_mayoristas
  }
```

- [ ] **Step 5: Add in_mayoristas to net_flow calculation**

In `fetchFlujoDeFondos()`, find the net_flow calculation:

```typescript
    row.net_flow =
      row.in_adelantado +
      row.in_en_termino +
      row.in_atrasado +
      row.in_pendiente +
      row.in_asistencia +
      row.in_proyectado +
```

Replace with:

```typescript
    row.net_flow =
      row.in_adelantado +
      row.in_en_termino +
      row.in_atrasado +
      row.in_pendiente +
      row.in_asistencia +
      row.in_mayoristas +
      row.in_proyectado +
```

- [ ] **Step 6: Add "May" column to finanzas page UI**

In `app/(admin)/finanzas/page.tsx`, find the header row. Add the "May" column after "Asist":

Find:

```tsx
                  <th className="text-right px-0.5 py-1.5 font-semibold text-green-600">Asist</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-blue-500">Proy</th>
```

Replace with:

```tsx
                  <th className="text-right px-0.5 py-1.5 font-semibold text-green-600">Asist</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-green-600">May</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-blue-500">Proy</th>
```

Then find the corresponding data cell. Find:

```tsx
                    <td className="px-0.5 py-0.5 text-right text-green-700">{fmtCompact(row.in_asistencia)}</td>
                    <td className="px-0.5 py-0.5 text-right text-blue-600">{fmtCompact(row.in_proyectado)}</td>
```

Replace with:

```tsx
                    <td className="px-0.5 py-0.5 text-right text-green-700">{fmtCompact(row.in_asistencia)}</td>
                    <td className="px-0.5 py-0.5 text-right text-green-700">{fmtCompact(row.in_mayoristas)}</td>
                    <td className="px-0.5 py-0.5 text-right text-blue-600">{fmtCompact(row.in_proyectado)}</td>
```

- [ ] **Step 7: Commit**

```bash
git add lib/actions/finanzas.ts app/\(admin\)/finanzas/page.tsx
git commit -m "feat: add in_mayoristas column to flujo de fondos"
```

---

### Task 9: Add limit check to confirmarProforma

**Files:**
- Modify: `lib/actions/proformas.ts`

- [ ] **Step 1: Add limit validation to confirmarProforma**

In `lib/actions/proformas.ts`, add the import at the top (after existing imports):

```typescript
import { verificarLimiteCC } from './pagos-mayoristas'
```

Then modify `confirmarProforma` to check the limit before confirming. Find:

```typescript
export async function confirmarProforma(id: string) {
  const supabase = createAdminClient()

  // Get next nro_proforma (starts at 145)
```

Replace with:

```typescript
export async function confirmarProforma(id: string) {
  const supabase = createAdminClient()

  // Check credit limit before confirming
  const { data: proforma } = await supabase
    .from('proformas')
    .select('cliente_mayorista_id, total_con_iva')
    .eq('id', id)
    .single()

  if (proforma?.cliente_mayorista_id) {
    const check = await verificarLimiteCC(proforma.cliente_mayorista_id, proforma.total_con_iva)
    if (!check.permitido) {
      return { error: check.mensaje }
    }
  }

  // Get next nro_proforma (starts at 145)
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/proformas.ts
git commit -m "feat: add credit limit check to confirmarProforma"
```

---

### Task 10: Verify and test

- [ ] **Step 1: Start dev server and verify build**

```bash
cd /home/cremi/consignacion-app
npm run dev
```

Verify no TypeScript errors in the terminal.

- [ ] **Step 2: Test Pagos page loads**

Open `http://localhost:3000/mayoristas/clientes/pagos` — verify both tabs render.

- [ ] **Step 3: Test manual payment entry**

On "Asentar Pago" tab, fill in fields manually (without image) and submit. Verify it saves.

- [ ] **Step 4: Test image upload**

Upload a test image of an echeq. Verify extraction works and form pre-fills.

- [ ] **Step 5: Test Cuenta Corriente integration**

Open Cuenta Corriente, select the client that has a payment. Verify the haber row appears.

- [ ] **Step 6: Test Flujo de Fondos integration**

Open Finanzas → Flujo de Fondos. Verify the "May" column appears and shows the payment on its fecha_cobro date.

- [ ] **Step 7: Test credit limit block**

Set a `limite_cuenta_corriente` on a client. Create a proforma that exceeds the limit. Verify confirmation is blocked.

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "feat: pagos mayoristas — complete implementation with OCR, CC, flujo integration"
```
