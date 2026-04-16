# Bloque B: Panel del Consignatario

**Date:** 2026-04-16
**Status:** Approved

## Overview

Construye el portal del consignatario: dashboard con garantía y gráfico de ventas, vista de stock sin IMEIs, flujo de auto-auditoría mensual obligatoria con scanner anónimo, y vista de liquidaciones con estado de retención. Al completar auto-auditoría del mes se libera la liquidación correspondiente automáticamente.

## Arquitectura

- Rutas bajo `app/(consignatario)/` con layout propio (sidebar diferente al admin)
- Middleware ya redirige a `/stock` si rol = 'consignatario' (existente)
- Server components para datos; client components para scanner, firma, gráfico
- Gráfico con **recharts** (nueva dependencia) — librería estándar de React para charts
- Todos los queries filtran implícitamente por `user_id = auth.uid()` vía RLS o explícitamente por consignatario_id

## Páginas y flujos

### 1. Layout `/app/(consignatario)/layout.tsx`

- Sidebar con logo GOcelular
- Nav items: Dashboard, Stock, Auto-auditoría, Liquidaciones
- Cerrar sesión
- Verifica rol=consignatario, redirige si no
- Carga el `consignatario` record para tenerlo en el contexto (pasado como prop a páginas hijas o via cookie)

### 2. Dashboard `/dashboard` (consignatario)

**Cards principales:**
- **Garantía** — misma card que tiene el admin en el detail: garantía / comprometido / disponible, con barra
- **Comisiones del mes en curso** — total comisiones + liquidación del mes anterior con su estado (si es 'retenida' muestra warning "Completá tu auto-auditoría para liberar el pago")
- **Diferencias pendientes** — si tiene deuda por diferencias, mostrar total (para transparencia)

**Gráfico:**
- Línea mensual de ventas en pesos — últimos 12 meses
- Eje Y: total pesos vendidos, Eje X: meses
- Usa `ventas.fecha_venta` + `ventas.precio_venta`

### 3. Stock `/stock`

Lista agrupada por modelo:
- Una row por modelo con cantidad asignada
- Columnas: Marca + Modelo, Cantidad (ej "3 equipos")
- **NO muestra IMEIs**
- Filtro por marca opcional
- Empty state si no hay stock asignado

### 4. Auto-auditoría `/auto-auditoria`

**Landing:**
- Determina si hay auditoría pendiente del mes actual (ninguna auditoria con tipo='auto', estado='confirmada' en este mes)
- Si NO hay pendiente: muestra "Auto-auditoría de {mes} completada ✓" con link al PDF
- Si hay pendiente: muestra el flujo de escaneo

**Flujo:**
1. Stock esperado agrupado por modelo: "Samsung A54 · 2 / 5" con barra de progreso
2. Componente de scanner (EscanerIMEI reusado) — al escanear un IMEI:
   - Se busca en dispositivos del consignatario (estado='asignado')
   - Si matchea: marca ese equipo como presente, incrementa contador del modelo correspondiente, actualiza barra de progreso
   - Feedback: "Samsung A54 escaneado ✓" (sin mostrar IMEI)
   - Si no matchea: "Equipo no reconocido" (sin dar detalles)
   - Si ya escaneado: "Ya escaneado"
3. Contador global: "X / Y equipos escaneados"
4. Campo observaciones (textarea)
5. FirmaCanvas (consignatario firma en su propio dispositivo)
6. Botón "Confirmar auto-auditoría"

**Al confirmar:**
- Server action `confirmarAutoAuditoria`:
  - Crea auditoría con `tipo='auto'`, `estado='confirmada'`
  - Crea auditoria_items con `presente=true` para escaneados, `presente=false` para resto
  - Ejecuta RPC `calcular_diferencias_auditoria` (genera diferencias por faltantes)
  - Busca liquidación del mes actual para ese consignatario:
    - Si existe con estado='retenida': la pasa a 'pendiente' y setea `fecha_auto_auditoria`
    - (NO libera meses anteriores retenidas)
  - Genera PDF con la misma template `acta-auditoria` pero **sin mostrar IMEIs** (nueva variante del template o flag)

### 5. Liquidaciones `/liquidaciones` (consignatario)

Listado propio del consignatario:
- Mes, Comisiones, Diferencias descontadas, Monto a pagar, Estado
- Si hay retenida del mes actual → warning prominente arriba: "Completá tu auto-auditoría de {mes} para liberar el pago"
- Si hay bloqueada → warning rojo: "Tu liquidación de {mes} está bloqueada. Contactá al administrador."
- Sin botones de acción (no puede modificar estados)
- PDF del recibo cuando está pagada

## Hide IMEIs en el consignatario

- Stock view: solo modelo + cantidad
- Auto-auditoría: lista por modelo (sin IMEI individual), progreso por modelo
- PDFs del consignatario: template sin columna IMEI (nueva template `acta-auditoria-consignatario` o flag en la existente)

Admin sigue viendo todo con IMEIs.

## Cambios de schema

Ninguno. Ya tenemos `tipo` en auditorías, `liquidaciones` existe. Solo agregamos lógica de transición automática.

## Archivos nuevos

**Rutas:**
- `app/(consignatario)/layout.tsx`
- `app/(consignatario)/dashboard/page.tsx`
- `app/(consignatario)/stock/page.tsx`
- `app/(consignatario)/auto-auditoria/page.tsx`
- `app/(consignatario)/auto-auditoria/AutoAuditoriaForm.tsx`
- `app/(consignatario)/liquidaciones/page.tsx`

**Componentes compartidos:**
- `app/(consignatario)/components/VentasChart.tsx` — gráfico recharts
- (Reusa FirmaCanvas y EscanerIMEI del admin — están en `app/(admin)/components/`, moverlas a `components/` general)

**PDF:**
- `lib/pdf/acta-auditoria-consignatario.tsx` — variante sin IMEI

**Actions:**
- `lib/actions/auto-auditoria.ts`

**Modify:**
- `middleware.ts` — ya redirige a /stock, verificar que no falle

## Dependencies nuevas

- `recharts` — para gráfico de ventas

## Out of scope

- Notificaciones push/email al consignatario
- Sincronización con GOcelular (siguiente bloque)
- Edición de perfil por parte del consignatario
