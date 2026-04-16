# Bloque C: Sync GOcelular + Ventas + PDF Liquidación

**Date:** 2026-04-16
**Status:** Approved

## Overview

Conecta consignacion-app con la base read-only de GOcelular para sincronizar ventas automáticamente, construye vistas de ventas detalladas por sucursal (admin y consignatario), agrega un PDF de liquidación con desglose, y deja lista la estructura para mapear sucursales de GOcelular al consignatario correcto.

## Arquitectura

- **Cliente PostgreSQL read-only** a GOcelular vía `pg` (ya probado: 3k+ dispositivos, 3k+ pedidos)
- **Matching por IMEI** (primario) con validación opcional por `store_prefix`
- **Idempotencia** vía `ventas.gocelular_sale_id` UNIQUE
- **Log auditable** en nueva tabla `sync_log`

## Schema changes

```sql
-- Prefijo de match para las sucursales de GOcelular de un consignatario
ALTER TABLE consignatarios ADD COLUMN IF NOT EXISTS store_prefix TEXT;

-- Sucursal donde se registró la venta (viene de gocuotas_orders.store_name)
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS store_name TEXT;

-- Log de sincronizaciones
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running | ok | error
  ventas_nuevas INTEGER NOT NULL DEFAULT 0,
  ventas_ya_existentes INTEGER NOT NULL DEFAULT 0,
  dispositivos_no_encontrados INTEGER NOT NULL DEFAULT 0,
  errores_monitoreo INTEGER NOT NULL DEFAULT 0,
  error_msg TEXT,
  detalle JSONB, -- detalle opcional con warnings por store prefix mismatch
  created_by UUID -- admin user_id
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON sync_log FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin');
```

## Flujo de sincronización

Server action `sincronizarVentas()`:

1. Crear fila en `sync_log` con status='running'
2. Leer de nuestra DB: todos los `dispositivos` donde `estado = 'asignado'` (imei, consignatario_id, precio_costo)
3. Leer de nuestra DB: `ventas.gocelular_sale_id` ya sincronizadas (para idempotencia)
4. Leer de nuestra DB: `consignatarios` (id, nombre, comision_porcentaje, store_prefix) para enrichment
5. Abrir conexión `pg` a GOCELULAR_DB_URL
6. Query GOcelular:
   ```sql
   SELECT ii.imei, ii.price AS precio_ii, ii.assigned_at, ii.assigned_to_order_id,
          dm.default_price AS precio_dm,
          go.store_name, go.order_created_at
   FROM inventory_items ii
   JOIN gocuotas_orders go ON go.order_id = ii.assigned_to_order_id
   LEFT JOIN device_models dm ON dm.model_code = ii.model_code
   WHERE ii.status = 'assigned'
     AND go.order_discarded_at IS NULL
     AND ii.imei = ANY($1)
     AND ii.assigned_to_order_id != ALL($2)
   ```
   donde `$1` = array de IMEIs nuestros, `$2` = array de sale_ids ya sincronizados
7. Para cada fila devuelta:
   - Buscar el dispositivo en nuestra DB por IMEI → consignatario_id
   - `precio_venta = precio_ii ?? precio_dm ?? 0`
   - `comision_monto = precio_venta × consignatario.comision_porcentaje`
   - Validar `store_prefix`: si existe y `store_name` no arranca con él → warning en `detalle.store_mismatches[]`
   - Insertar en `ventas` (dispositivo_id, consignatario_id, fecha_venta=assigned_at::date, precio_venta, comision_monto, gocelular_sale_id=order_id, store_name, synced_at=NOW())
   - Update `dispositivos.estado = 'vendido'`
8. Cerrar conexión
9. Update `sync_log` con contadores, status='ok', finished_at=NOW()

Errores: capturar y guardar en `sync_log.error_msg`, status='error'.

## Páginas

### Admin `/sync`
- Botón "Sincronizar ahora" (bloquea mientras corre)
- Resumen de última ejecución: fecha, nuevas, ya existentes, no encontradas, warnings
- Tabla del historial (últimos 20 sync): started_at, status (badge), nuevas, detalle colapsable con warnings
- Sidebar: nuevo item "Sincronización"

### Admin `/ventas`
- Filtros: mes, consignatario
- Estructura anidada por consignatario → sucursal → venta:
  ```
  ▼ Juan Pérez [total: 15 ventas · $2.400.000 · comisión $240.000]
      ▼ RIIING Centro [8 ventas · $1.200.000 · comisión $120.000]
          2026-04-05 · IMEI 3504... · Moto G06 · $150.000 · $15.000
          ...
      ▼ RIIING Norte [5 ventas · $800.000 · comisión $80.000]
          ...
  ```
- Secciones colapsables. Totales en cada header. Total general al pie.
- Sidebar: nuevo item "Ventas"

### Consignatario `/mis-ventas`
- Misma estructura pero filtrada a su consignatario_id
- Sin filtro de consignatario (solo mes)
- Sidebar del consignatario: nuevo item "Mis ventas"

### Dashboard admin — nueva card
- "Ventas del mes": total monto + total comisiones + desglose por consignatario (top 5)

### Formulario consignatario
- Campo `store_prefix` en create form y edit form (input text, placeholder "Ej: RIIIN", help "Primeros caracteres comunes de los `store_name` de GOcelular de este consignatario")

## PDF de liquidación

### Template `lib/pdf/liquidacion.tsx`
Estructura:
- Header: "GOcelular — Liquidación de comisiones", logo
- Meta: consignatario, mes, fecha de emisión
- Resumen en recuadro:
  - Total ventas
  - Total comisiones
  - Diferencias descontadas (si hay)
  - **Monto a pagar**
  - Estado (retenida/pendiente/bloqueada/pagada)
- Desglose por sucursal:
  - Subtítulo con nombre de sucursal
  - Tabla: Fecha · IMEI (solo primeros 6 para privacidad) · Modelo · Monto · Comisión
  - Subtotal por sucursal
- Total general al pie
- Si hay diferencias descontadas: tabla de diferencias (auditoría, dispositivo, monto)
- Firma del consignatario (si `fecha_auto_auditoria` != null, reusamos la firma de la auto-auditoría)

### API route `/api/pdf/liquidacion/[id]/route.tsx`
- Carga la liquidación + consignatario + ventas del mes + diferencias descontadas + firma de la auto-auditoría del mismo mes
- Renderiza el template → devuelve PDF

### Links al PDF
- En `/liquidaciones` (admin): columna extra con "Descargar recibo"
- En `/mis-liquidaciones` (consignatario): columna extra con "Descargar recibo"

## Middleware

Agregar rutas admin: `/sync`, `/ventas`
Agregar rutas consignatario: `/mis-ventas`

## RLS policies nuevas

- `sync_log`: admin_all (ya incluido arriba)
- `ventas` ya tiene `consignatario_select_ventas` para que cada consignatario vea las suyas
- `consignatarios.store_prefix`: no requiere nueva policy (heredó de row)

## Environment

`.env.local` ya tiene `GOCELULAR_DB_URL` configurado. Para producción (Vercel u otro), agregar la misma variable.

## Out of scope (futuro)

- Cron job automático (arrancamos con botón manual)
- Reversión de ventas si se cancela el pedido en GOcelular (`order_discarded_at`)
- Firma en PDF de liquidación (lo dejamos con la firma del auto-audit)
- Attribution de ventas sin IMEI en consignacion-app vía `store_prefix`

## File structure

**Nuevos:**
- `lib/gocelular.ts`
- `lib/actions/sync.ts`
- `lib/pdf/liquidacion.tsx`
- `app/(admin)/sync/page.tsx`
- `app/(admin)/sync/SyncButton.tsx`
- `app/(admin)/ventas/page.tsx`
- `app/(admin)/ventas/VentasTable.tsx` (client, para collapsibles)
- `app/(consignatario)/mis-ventas/page.tsx`
- `app/api/pdf/liquidacion/[id]/route.tsx`

**Modify:**
- `lib/types.ts` (Consignatario.store_prefix, Venta.store_name, SyncLog interface)
- `middleware.ts`
- `app/(admin)/layout.tsx` (nav items)
- `app/(consignatario)/layout.tsx` (nav item)
- `app/(admin)/dashboard/page.tsx` (ventas card)
- `app/(admin)/consignatarios/page.tsx` (store_prefix field)
- `app/(admin)/consignatarios/[id]/EditarForm.tsx` (store_prefix field)
- `app/(admin)/liquidaciones/page.tsx` (link PDF)
- `app/(consignatario)/mis-liquidaciones/page.tsx` (link PDF)
