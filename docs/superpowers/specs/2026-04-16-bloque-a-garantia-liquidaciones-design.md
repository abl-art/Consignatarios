# Bloque A: Garantía, Split Auditorías, Liquidaciones (Admin)

**Date:** 2026-04-16
**Status:** Approved

## Overview

Extiende el sistema con: (1) campo de garantía por consignatario que limita el valor de stock asignado, (2) división de auditorías en Físicas/Auto con sub-tabs, (3) sistema de liquidaciones mensuales con estados automáticos basados en auto-auditorías completadas.

El Bloque B (panel consignatario con auto-auditoría, gráfico de ventas, vista de liquidaciones) queda para la siguiente fase.

## Changes

### 1. Schema — nuevos campos y tabla

**Modificar `consignatarios`:**
- Agregar `garantia NUMERIC NOT NULL DEFAULT 0` — monto máximo en pesos que el consignatario respalda

**Modificar `auditorias`:**
- Agregar `tipo TEXT NOT NULL DEFAULT 'fisica'` — enum informal: 'fisica' | 'auto'

**Nueva tabla `liquidaciones`:**
```sql
CREATE TABLE liquidaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consignatario_id UUID NOT NULL REFERENCES consignatarios(id),
  mes TEXT NOT NULL,  -- 'YYYY-MM'
  total_comisiones NUMERIC NOT NULL DEFAULT 0,
  total_diferencias_descontadas NUMERIC NOT NULL DEFAULT 0,
  monto_a_pagar NUMERIC NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'retenida', -- 'retenida' | 'pendiente' | 'bloqueada' | 'pagada'
  fecha_auto_auditoria DATE,
  fecha_pago DATE,
  firma_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(consignatario_id, mes)
);

ALTER TABLE liquidaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON liquidaciones FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin');
CREATE POLICY consignatario_select ON liquidaciones FOR SELECT
  USING (consignatario_id IN (SELECT id FROM consignatarios WHERE user_id = auth.uid()));
```

### 2. Garantía validation en `/asignar`

**Cálculo del compromiso actual del consignatario:**
```
compromiso = suma(precio_costo de dispositivos asignados al consignatario)
           + suma(monto_deuda de diferencias pendientes del consignatario)
```

**Al seleccionar consignatario en `/asignar`:**
- Muestra card: "Garantía: $X — Comprometido: $Y — Disponible: $Z"
- Barra visual de progreso (verde/amarillo/rojo según %)

**Al agregar/quitar dispositivos:**
- Calcula `nuevo_compromiso = compromiso + suma(precio_costo de seleccionados)`
- Si `nuevo_compromiso > garantia`: muestra warning rojo "Excede la garantía en $X"
- Botón "Asignar" deshabilitado si excede
- Si `garantia = 0`: permite cualquier asignación (garantía no configurada)

### 3. Formulario consignatario — editar campo garantía

**En `/consignatarios`:**
- Form de creación incluye input `garantia` (numeric, placeholder "Monto garantía en pesos")
- Server action guarda el campo

**Nueva página `/consignatarios/[id]/editar`** (o inline form en detail):
- Campos editables: nombre, email, teléfono, comision, punto_reorden, **garantia**
- Server action para actualizar

### 4. Split de auditorías en tabs

**Reestructurar `/auditorias`:**
- `/auditorias/page.tsx` queda como tabs container con default redirect a `/auditorias/fisicas`
- `/auditorias/fisicas/page.tsx` — listado actual (filtrado por `tipo = 'fisica'`)
- `/auditorias/auto/page.tsx` — listado de auto-auditorías (filtrado por `tipo = 'auto'`)
- Ambas páginas muestran tabs nav al inicio: "Físicas" | "Auto"

**En `/auditorias/nueva`:**
- No cambia (sigue siendo física). Las auto-auditorías se crean desde el panel del consignatario (Bloque B).
- Para el Bloque A, la pestaña "Auto" muestra placeholder "Las auto-auditorías se realizarán desde el panel del consignatario" + listado vacío.

**Migración del server action existente:**
- `crearAuditoria` ahora incluye `tipo: 'fisica'` por defecto

### 5. Nueva página `/liquidaciones` (admin)

**Listado:**
- Filtros: por mes (dropdown con últimos 12 meses), por consignatario, por estado
- Tabla: Mes, Consignatario, Comisiones, Diferencias, A pagar, Estado (badge), Auto-auditoría (check/cross), Acciones
- Summary cards arriba: Total a pagar este mes, Total retenido, Total bloqueado

**Botón "Generar liquidaciones del mes":**
- Crea registros para todos los consignatarios que tengan ventas en el mes seleccionado
- Por cada consignatario:
  - `total_comisiones` = suma de `comision_monto` de ventas del mes
  - `total_diferencias_descontadas` = suma de diferencias pendientes (al momento de generar)
  - `monto_a_pagar` = `total_comisiones - total_diferencias_descontadas`
  - `estado` = 'retenida' (hasta que se complete auto-auditoría)
- Si ya existe liquidación para ese consignatario+mes: no la duplica

**Actions en cada fila:**
- **Desbloquear** (solo visible si estado='bloqueada') → cambia a 'pendiente'
- **Marcar pagada** (si estado='pendiente') → cambia a 'pagada', registra fecha_pago
- **Ver detalle** (modal o página): muestra desglose completo de ventas y diferencias

**Lógica automática de estados:**
- Cuando una auditoría `tipo='auto'` se confirma para un consignatario+mes:
  - Busca liquidación correspondiente, actualiza `fecha_auto_auditoria` y `estado = 'pendiente'`
- Al cargar la página: si hay liquidaciones en 'retenida' con >5 días desde `created_at`:
  - Marca como 'bloqueada' automáticamente

### 6. Dashboard admin — nueva card "Liquidaciones"

Card adicional:
- Título: "Liquidaciones — {mes anterior}"
- Desglose: X pendientes / Y bloqueadas / Z pagadas
- Total a pagar pendiente (en pesos)
- Link a `/liquidaciones`
- Color rojo si hay bloqueadas

### 7. Sidebar — nuevo item

Agregar en `app/(admin)/layout.tsx`:
```
{ href: '/liquidaciones', label: 'Liquidaciones' }
```

## Archivos nuevos / modificados

**Nuevos:**
- `app/(admin)/liquidaciones/page.tsx`
- `app/(admin)/liquidaciones/LiquidacionesActions.tsx`
- `app/(admin)/auditorias/fisicas/page.tsx`
- `app/(admin)/auditorias/auto/page.tsx`
- `app/(admin)/auditorias/AuditoriaTabs.tsx`
- `app/(admin)/consignatarios/[id]/EditarForm.tsx`
- `lib/actions/liquidaciones.ts`
- `lib/actions/consignatarios.ts` (nuevo archivo para edit action)

**Modificados:**
- `app/(admin)/asignar/AsignarForm.tsx` — add garantía validation
- `app/(admin)/asignar/page.tsx` — load pending diferencias
- `app/(admin)/consignatarios/page.tsx` — add garantia form field
- `app/(admin)/consignatarios/[id]/page.tsx` — show garantia + edit option
- `app/(admin)/auditorias/page.tsx` — redirect to fisicas
- `app/(admin)/dashboard/page.tsx` — add liquidaciones card
- `app/(admin)/layout.tsx` — add liquidaciones nav item
- `lib/actions/auditorias.ts` — add tipo='fisica' on create
- `lib/types.ts` — update Consignatario with garantia, Auditoria with tipo, add Liquidacion interface

## Out of Scope (Bloque B)

- Panel consignatario (`/stock`, `/auto-auditoria`, `/liquidaciones` vista consignatario)
- Auto-auditoría flow (escaneo sin mostrar IMEI, firma)
- Gráfico de líneas de ventas en pesos
- PDFs de liquidación firmados
- Ocultar IMEIs en PDFs de consignatario
