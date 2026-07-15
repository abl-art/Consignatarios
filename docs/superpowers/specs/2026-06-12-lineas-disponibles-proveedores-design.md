# Líneas disponibles de proveedores — Cuenta corriente + Cheques

**Fecha:** 2026-06-12
**Objetivo:** Visualizar cuánto saldo de cuenta corriente tiene disponible cada proveedor, descontando cheques no vencidos, y cuándo se libera saldo a medida que los cheques vencen.

## Resumen

Cada proveedor tiene un límite de cuenta corriente (cargado manualmente). Del Google Sheet de cheques se extrae qué cheques están pendientes por proveedor (matcheo por CUIT). El disponible es: `límite - SUM(cheques con fecha_pago >= hoy)`. Se muestra un gráfico tipo línea de tiempo horizontal ("Líneas disponibles") en la página de Compras.

## Modelo de datos

### Campo nuevo en `compras_proveedores`

- `limite_cuenta_corriente` (numeric, default null) — límite manual de cuenta corriente del proveedor.

### Nueva tabla `cheques_proveedor`

```sql
CREATE TABLE cheques_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuit text NOT NULL,
  nombre text,
  numero_cheque text,
  importe numeric NOT NULL,
  fecha_pago date NOT NULL,
  estado_cheque text,
  synced_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cheques_proveedor_cuit ON cheques_proveedor (cuit);
CREATE INDEX idx_cheques_proveedor_fecha ON cheques_proveedor (fecha_pago);
```

### Config

- Fila en `flujo_config` con key `cheques_last_sync` — timestamp ISO de última sincronización.

### Cálculo de disponible

- Cheques pendientes de un proveedor = filas en `cheques_proveedor` donde `cuit = proveedor.cuit` AND `fecha_pago >= hoy`.
- Disponible = `limite_cuenta_corriente - SUM(importe de cheques pendientes)`.
- Proveedores sin `limite_cuenta_corriente` no aparecen en el gráfico.

## Sincronización de cheques

### Fuente de datos

Google Sheet público exportado como CSV:
```
https://docs.google.com/spreadsheets/d/1fbcEB5o9nERC6BTmf94nVqOsKpJ3KJ6tVG_UPPbuaqg/gviz/tq?tqx=out:csv&sheet=cheques
```

Solo lectura. Nunca modificar el Sheet.

### Columnas del Sheet utilizadas

| Columna CSV (índice) | Campo destino |
|---|---|
| 0 - Número de Cheque | `numero_cheque` |
| 2 - Estado del Cheque | `estado_cheque` |
| 3 - CUIT/CUIL Beneficiario | `cuit` |
| 4 - Nombre o Razón Social Beneficiario | `nombre` |
| 6 - Fecha Pago | `fecha_pago` |
| 7 - Importe | `importe` (limpiar `$`, `.` separador de miles, `,` decimal) |

### API Route: `POST /api/cron/sync-cheques`

1. Fetch CSV desde la URL pública.
2. Parsear CSV, extraer columnas relevantes.
3. Limpiar importe: quitar `$`, reemplazar `.` (miles) por nada, reemplazar `,` (decimal) por `.`.
4. Parsear fecha de pago (formato `D/M/YYYY`).
5. DELETE all from `cheques_proveedor`, INSERT batch (full replace).
6. Actualizar `cheques_last_sync` en `flujo_config` con timestamp actual.
7. Proteger con header `Authorization: Bearer CRON_SECRET`.

### Cron

En `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/sync-cheques",
    "schedule": "0 21 * * *"
  }]
}
```
(21 UTC = 18:00 Argentina)

### Botón manual

Botón "Sincronizar" en la UI que llama al mismo endpoint. Muestra spinner durante la sync y luego actualiza "Última sync: DD/MM HH:mm".

## UI — Gráfico "Líneas disponibles"

### Ubicación

Página `/compras` (`app/(admin)/compras/page.tsx`), entre las tarjetas superiores y la tabla "En tránsito por modelo".

### Estructura

- **Título:** "Líneas disponibles"
- **Derecha del título:** Texto "Última sync: DD/MM HH:mm" + botón ícono refresh "Sincronizar"
- **Contenido:** Una línea de tiempo horizontal por cada proveedor con `limite_cuenta_corriente` cargado.

### Cada línea de proveedor

- **Izquierda:** Nombre del proveedor + monto disponible actual (ej: "$12M disponible de $50M")
- **Eje X:** Fechas desde hoy hacia adelante (~90 días)
- **Puntos/bloques:** En las fechas de vencimiento de cheques, mostrando el monto que se libera
- **Visualización:** El disponible crece a medida que los cheques vencen en el timeline

### Colores

- Verde: disponible > 50% del límite
- Amarillo: disponible entre 20-50% del límite
- Rojo: disponible < 20% del límite

### Filtros

- Solo se muestran proveedores que tengan `limite_cuenta_corriente` cargado (no null).

## Cambios en formulario de proveedores

En `ProveedoresClient.tsx`, agregar campo "Límite cuenta corriente" al formulario de crear/editar proveedor. Campo numérico, opcional.

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| Migración SQL nueva | Crear tabla `cheques_proveedor` + campo `limite_cuenta_corriente` |
| `app/api/cron/sync-cheques/route.ts` | Crear — endpoint de sincronización |
| `vercel.json` | Agregar cron sync-cheques |
| `lib/actions/compras.ts` | Agregar queries de cheques y disponible por proveedor |
| `app/(admin)/compras/proveedores/ProveedoresClient.tsx` | Agregar campo límite cuenta corriente |
| `app/(admin)/compras/page.tsx` | Agregar gráfico "Líneas disponibles" + botón sync |
| Nuevo componente `LineasDisponiblesChart.tsx` | Componente del gráfico timeline |
