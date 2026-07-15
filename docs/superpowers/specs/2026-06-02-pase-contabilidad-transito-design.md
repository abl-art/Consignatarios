# Pase a Contabilidad: Pedidos en Transito Facturados

**Fecha:** 2026-06-02
**Estado:** Aprobado

## Objetivo

Permitir que el usuario seleccione pedidos en transito (facturados pero no recibidos) para incluirlos en el reporte mensual de pase a contabilidad. Esto refleja contablemente el activo en transito como linea separada por categoria.

## Criterio de pedidos en transito para un periodo

Un pedido aparece como "en transito" para el periodo YYYY-MM si cumple:

- `estado = 'enviado'`
- `confirmadoAt <= ultimo dia del mes` (fue enviado antes del cierre)
- `entregadoAt` es null **o** `entregadoAt > ultimo dia del mes` (no habia sido recibido al cierre)

Esto captura pedidos que hoy ya estan recibidos pero al cierre del mes estaban en transito.

## Seleccion

- Se selecciona el **pedido completo** (no items individuales)
- La seleccion se persiste para trazabilidad y auditorias futuras

## Valuacion

Se usa `getMejorPrecio()` (mejor precio de reposicion) para valuar cada item, no el precio del pedido. Esto es contablemente correcto: los bienes se valuan a costo de reposicion independientemente del proveedor.

## Persistencia

Nueva tabla `pase_contabilidad_transito`:

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | uuid (PK) | ID unico |
| periodo | text | YYYY-MM del reporte |
| pedido_id | text | Referencia al pedido en flujo_config |
| categoria | text | Categoria del pedido (Celulares, Kits de Seguridad, etc.) |
| items | jsonb | Snapshot de items: [{productoNombre, cantidad, precioUnit, subtotal}] |
| valuacion | numeric | Suma total de valuacion al momento de confirmar |
| unidades | integer | Total de unidades del pedido |
| created_at | timestamptz | Fecha de creacion del registro |

Constraint: unique(periodo, pedido_id) - un pedido solo puede incluirse una vez por periodo.

## UI: Seccion en Pase a Contabilidad

Debajo del reporte actual, nueva seccion "Pedidos en transito":

1. Lista de pedidos que cumplen el criterio para el periodo seleccionado
2. Cada pedido se muestra como card con:
   - Proveedor, fecha de envio, categoria
   - Items (producto, cantidad)
   - Valuacion calculada con getMejorPrecio
3. Checkbox para seleccionar/deseleccionar
4. Boton "Confirmar seleccion" que persiste en la tabla
5. Pedidos ya confirmados se muestran como seleccionados y pueden deseleccionarse

## Reporte y PDF

El reporte agrega una linea separada por cada categoria que tenga pedidos en transito confirmados:

| Categoria | Unidades | Valuacion | Estado |
|-----------|----------|-----------|--------|
| Celulares | 45 | $12.500.000 | ok |
| Celulares - En transito facturados | 10 | $2.800.000 | ok |
| Kits de Seguridad | 20 | $3.000.000 | ok |

El PDF incluye estas lineas con el formato: `{Categoria} EN TRANSITO Facturados en {mes}`.

## Datos necesarios

- Pedidos: de `flujo_config` (keys `pedido_*`), ya parseados por `fetchPedidos()`
- Precios: de `getMejorPrecio()` en `lib/actions/compras.ts`
- Persistencia: nueva tabla `pase_contabilidad_transito` en Supabase

## Archivos a modificar

1. **Nueva migracion SQL**: crear tabla `pase_contabilidad_transito`
2. **lib/actions/pase-contabilidad.ts**: nuevas funciones para filtrar pedidos en transito, guardar/eliminar seleccion, incluir en reporte
3. **PaseContabilidadClient.tsx**: seccion de seleccion de pedidos
4. **PDF route**: incluir lineas de transito en el PDF
