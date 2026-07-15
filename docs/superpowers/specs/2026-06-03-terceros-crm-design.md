# Venta a Terceros + CRM

**Fecha:** 2026-06-03
**Estado:** Aprobado

## Objetivo

Nueva seccion "Venta a Terceros" con dos subpaginas: un CRM tipo Kanban para gestionar prospectos comerciales, y una pagina de Altas que muestra los terceros activos con sus metricas de venta.

## Navegacion

Nueva seccion en el sidebar debajo de Consignatarios:

- **Venta a Terceros** (seccion colapsable)
  - CRM → `/terceros/crm`
  - Altas → `/terceros/altas`

## Subpagina CRM (`/terceros/crm`)

### Header: 4 cards de resumen

Cada card muestra:
- Nombre de la etapa
- Total de prospectos en esa etapa
- Total de sucursales en esa etapa
- Tiempo promedio en la etapa (dias) calculado como promedio de (fecha_salida - fecha_entrada) de todos los prospectos que ya pasaron por esa etapa. Para prospectos aun en la etapa, se usa (hoy - fecha_entrada).

### Kanban: 4 columnas

**Prospecto → Propuesta enviada y seguimiento → Ganado → Perdido**

Cada tarjeta muestra:
- Nombre del prospecto
- Cantidad de sucursales (editable inline)
- Fecha de ingreso a la etapa actual (formato relativo: "hace 3 dias")

Botones para mover entre columnas (no requiere drag & drop en v1).

### Acciones

**Agregar prospecto:** Boton "Nuevo prospecto" que pide nombre y cantidad de sucursales. Se crea en estado "prospecto".

**Mover a "Propuesta enviada y seguimiento":**
- Se actualiza `propuesta_at` con timestamp actual
- Se crea automaticamente una nota en la tabla `notas` con:
  - Texto: "Seguimiento prospecto: {nombre}"
  - Fecha: 7 dias despues (o dia habil siguiente via `diaHabilSiguiente`)

**Mover a "Ganado":** Se actualiza `ganado_at`.

**Mover a "Perdido":** Se actualiza `perdido_at`.

### Seguimiento automatico recurrente

Cuando una nota de seguimiento de un prospecto se marca como completada (tachada), se genera automaticamente una nueva nota a 7 dias habiles posteriores. Este ciclo se repite hasta que el prospecto pase a "Ganado" o "Perdido".

**Implementacion:** Un hook en la accion de completar nota que verifica si la nota es de seguimiento de prospecto (por convencion en el texto o por referencia al prospecto_id) y si el prospecto sigue en estado "propuesta", crea una nueva nota.

Para vincular notas a prospectos: agregar campo opcional `prospecto_id` a la tabla de notas, o usar convencion de texto "Seguimiento prospecto: {nombre}" + buscar por nombre. Recomendacion: agregar `prospecto_id` nullable a notas para vinculo explicito.

## Subpagina Altas (`/terceros/altas`)

Lista de terceros activos extraida de `gocuotas_orders` agrupada por `client_id`.

Cada card de tercero muestra:
- Nombre del merchant (RIIING, TECNO-COMPRO, Plus Phone, etc.)
- Client ID
- Cantidad de tiendas (store_names unicos)
- Ventas ultimos 30 dias: cantidad de ordenes y monto total
- Link al dashboard de terceros existente

**Query:** Agrupa `gocuotas_orders` por `client_id` donde `client_id` IN (IDs terceros), calcula count y sum de `total_order_amount` con `order_created_at >= now() - 30 dias`.

## Persistencia

### Nueva tabla `crm_prospectos`

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | uuid PK | DEFAULT gen_random_uuid() |
| nombre | text NOT NULL | Nombre del prospecto |
| sucursales | integer NOT NULL DEFAULT 0 | Cantidad de sucursales |
| estado | text NOT NULL DEFAULT 'prospecto' | prospecto / propuesta / ganado / perdido |
| prospecto_at | timestamptz NOT NULL DEFAULT now() | Cuando entro a prospecto |
| propuesta_at | timestamptz | Cuando paso a propuesta |
| ganado_at | timestamptz | Cuando se gano |
| perdido_at | timestamptz | Cuando se perdio |
| created_at | timestamptz NOT NULL DEFAULT now() | |

### Modificacion tabla notas

Agregar columna nullable `prospecto_id uuid REFERENCES crm_prospectos(id) ON DELETE SET NULL` para vincular notas de seguimiento a prospectos.

## Archivos

1. `supabase/migrations/20260603_create_crm_prospectos.sql` — Tabla + columna en notas
2. `lib/actions/crm-terceros.ts` — CRUD prospectos, cambio de estado, creacion de nota de seguimiento, fetch altas con metricas
3. `app/(admin)/terceros/crm/page.tsx` — Server page
4. `app/(admin)/terceros/crm/CRMClient.tsx` — Kanban interactivo
5. `app/(admin)/terceros/altas/page.tsx` — Lista de terceros activos
6. `app/(admin)/layout.tsx` — Agregar seccion "Venta a Terceros" al nav
