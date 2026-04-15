# Admin Flow: Asignar Stock, Auditorias, Diferencias, Reportes + Dashboard

**Date:** 2026-04-15
**Status:** Approved

## Overview

Complete admin workflow for consignment management: assign devices to consignees with signature, audit physical inventory via barcode scanning with camera, track discrepancies, and report commissions. All signature capture happens on-device (consignee signs with finger on admin's screen).

## Architecture

- **Framework:** Next.js 14 (App Router), server components + client components where needed
- **DB:** Supabase (existing schema with tables: dispositivos, asignaciones, asignacion_items, auditorias, auditoria_items, diferencias, ventas, config, consignatarios, modelos)
- **PDF:** `@react-pdf/renderer` (already installed)
- **Barcode scanner:** `html5-qrcode` (new dependency — browser camera API for IMEI barcode reading)
- **Signature:** Custom canvas component (touch/mouse, exports base64 PNG)
- **Styling:** Tailwind CSS (existing patterns)

## Shared Components

### 1. FirmaCanvas (`app/(admin)/components/FirmaCanvas.tsx`)
- Client component with HTML5 Canvas
- Touch and mouse event support (works on mobile and desktop)
- Draws strokes following finger/pointer movement
- Buttons: "Limpiar" (clear canvas), "Confirmar" (export)
- On confirm: exports canvas as base64 PNG string via `onSave(base64: string)` callback
- Props: `onSave: (base64: string) => void`, `width?: number`, `height?: number`

### 2. EscanerIMEI (`app/(admin)/components/EscanerIMEI.tsx`)
- Client component wrapping `html5-qrcode`
- Opens device camera to scan barcodes (CODE_128, EAN_13 — common IMEI barcode formats)
- On successful scan: calls `onScan(imei: string)` callback
- Manual IMEI input fallback (text field + "Agregar" button)
- Button to toggle camera on/off
- Shows last scanned IMEI for feedback

### 3. PDF Templates (`lib/pdf/`)
- `remito-asignacion.tsx` — Assignment receipt PDF
  - Header: "GOcelular — Remito de Asignacion"
  - Date, consignatario name, admin who assigned
  - Table: IMEI, Marca, Modelo, Precio Costo, Precio Venta
  - Totals: units, total cost value, total sale value
  - Signature image at bottom
- `acta-auditoria.tsx` — Audit report PDF
  - Header: "GOcelular — Acta de Auditoria"
  - Date, consignatario name, auditor name
  - Table: IMEI, Marca, Modelo, Presente (Si/No)
  - Summary: total expected, present, missing
  - Observations text
  - Signature image at bottom

## Pages

### 1. Asignar Stock (`/asignar`) — `app/(admin)/asignar/page.tsx`

**Purpose:** Assign available devices to a consignee with signed receipt.

**Flow:**
1. Select consignatario from dropdown
2. See list of devices with `estado = 'disponible'`, filterable by marca/modelo
3. Select devices via checkboxes (multi-select)
4. Review summary: selected count, total cost value, total sale value (cost x multiplicador)
5. Input "firmado_por" (name of person receiving)
6. Consignee signs on FirmaCanvas
7. Submit: creates asignacion + asignacion_items, updates dispositivos.estado to 'asignado' and sets consignatario_id, stores firma as base64

**Implementation:**
- Server component loads consignatarios and available devices
- Client component (`AsignarForm.tsx`) handles selection, signature, and submission
- Submission calls server action that:
  - Inserts into `asignaciones` (consignatario_id, fecha, total_unidades, total_valor_costo, total_valor_venta, firmado_por, firma_url)
  - Inserts into `asignacion_items` (asignacion_id, dispositivo_id) for each device
  - Updates each `dispositivos` row: estado='asignado', consignatario_id=selected
- After success: option to download/share PDF remito, redirect to asignaciones history

### 2. Auditorias (`/auditorias`) — `app/(admin)/auditorias/page.tsx`

**Purpose:** Physical audit of consignee inventory by scanning devices.

**Listing view:**
- Table of all auditorias with: fecha, consignatario name, estado badge (borrador/confirmada), device count, actions
- Button "Nueva auditoria"

**New audit flow (`/auditorias/nueva`):**
1. Select consignatario
2. System loads all dispositivos with `estado = 'asignado'` AND `consignatario_id = selected` (these are the devices that should be physically present — future: exclude sold ones when GOcelular DB is connected)
3. Display expected device count
4. Admin uses EscanerIMEI component to scan each device's barcode with camera
5. As each IMEI is scanned:
   - If found in expected list → mark as "presente" (green check, move to "scanned" section)
   - If not found → show warning "IMEI no esperado" (could be a sobrante)
   - If already scanned → show "Ya escaneado"
6. Live progress: "Escaneados: X / Y esperados"
7. Manual IMEI input as fallback
8. Input: observaciones (textarea)
9. Input: realizada_por (auditor name)
10. FirmaCanvas: consignee signs
11. Actions: "Guardar borrador" or "Confirmar auditoria"
12. On confirm: calls `calcular_diferencias_auditoria(auditoria_id)` RPC, generates PDF

**Implementation:**
- `/auditorias/page.tsx` — Server component listing
- `/auditorias/nueva/page.tsx` — Client-heavy page with scanner + signature
- Server action for save/confirm

### 3. Diferencias (`/diferencias`) — `app/(admin)/diferencias/page.tsx`

**Purpose:** Track and manage discrepancies found during audits.

**View:**
- Table of all diferencias with filters:
  - By consignatario (dropdown)
  - By tipo (faltante/sobrante)
  - By estado (pendiente/cobrado/resuelto)
- Columns: IMEI, Modelo, Consignatario (from auditoria), Tipo badge, Monto deuda, Estado badge, Fecha (from auditoria), Actions
- Actions per row: dropdown to change estado (pendiente → cobrado, pendiente → resuelto)
- Summary cards at top: total pendiente amount, total cobrado, total resuelto, grouped by consignatario

**Implementation:**
- Server component with search params for filters
- Client component for status change (calls server action)

### 4. Reportes (`/reportes`) — `app/(admin)/reportes/page.tsx`

**Purpose:** Business intelligence and financial reporting.

**Sections:**

**a) Comisiones por consignatario y mes**
- Table: rows = consignatarios, columns = months
- Cell value = sum of comision_monto from ventas for that consignatario/month
- Total row and total column
- Note: will show real data once ventas are populated (GOcelular sync)

**b) Stock por consignatario**
- Per consignatario: asignados count, vendidos count, disponibilidad %
- Bar or progress visualization

**c) Diferencias pendientes**
- Per consignatario: count of pendiente diferencias, total monto
- Highlight consignatarios with pending debts

**d) Ranking consignatarios**
- By ventas volume (once available)
- By diferencias (fewer = better)

**Implementation:**
- Server component with Supabase aggregate queries
- Pure data tables, no charting library needed (Tailwind-styled tables)

### 5. Dashboard Improvements (`/dashboard`)

**Add to existing dashboard:**

**New card: "Comisiones a pagar"**
- Shows current month total commissions owed
- Breakdown by consignatario: name + amount
- Data from: `ventas` table, sum of `comision_monto` where fecha_venta is current month

**New card: "Diferencias pendientes"**
- Alert-style card (red/amber) if there are unresolved diferencias
- Count + total monto
- Link to /diferencias

**Existing cards remain** (total devices, disponibles, asignados, vendidos, consignatarios, modelos)

## Data Flow Summary

```
Dispositivo (disponible)
    ↓ [Asignar stock + firma]
Dispositivo (asignado) + Asignacion record
    ↓ [Auditoria + escaneo + firma]
AuditoriaItems (presente: true/false)
    ↓ [Confirmar auditoria]
Diferencias (faltante/sobrante, pendiente)
    ↓ [Admin gestiona]
Diferencias (cobrado/resuelto)
```

## New Dependencies

- `html5-qrcode` — Barcode/QR scanner using device camera

## File Structure (new files)

```
app/(admin)/
├── components/
│   ├── FirmaCanvas.tsx
│   └── EscanerIMEI.tsx
├── asignar/
│   └── page.tsx
├── auditorias/
│   ├── page.tsx
│   └── nueva/
│       └── page.tsx
├── diferencias/
│   └── page.tsx
├── reportes/
│   └── page.tsx
├── dashboard/
│   └── page.tsx  (update existing)
lib/
├── pdf/
│   ├── remito-asignacion.tsx
│   └── acta-auditoria.tsx
├── actions/
│   ├── asignar.ts
│   ├── auditorias.ts
│   └── diferencias.ts
```

## Out of Scope (future phases)

- Consignatario portal (stock, ventas, comisiones, recibos)
- GOcelular DB sync (ventas auto-import, exclude sold from audits)
- Push notifications
