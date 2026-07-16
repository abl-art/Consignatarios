# CRM KEYcontact — Pipeline GOcelulares Report

## Overview

Replace the old CRM page at `/terceros/crm` with a new report connected to KEYcontact's database, focused on the pipeline "GOcelulares". The page uses the same tab layout as Finanzas (`FinanzasTabs` component) with 3 tabs: Pipeline, Conversión, Reuniones. A new "CRM" card is added back to the Terceros hub pointing to this page.

## Data Source

- **Database:** KEYcontact Supabase Postgres via connection pooler (port 6543, transaction mode)
- **Connection pattern:** Same as GOcelular DB — a `getKeyContactPool()` helper using `pg.Pool` with `KEYCONTACT_DB_URL` env var
- **Pipeline ID:** `6d86ed8c-704b-41f9-adf6-772bb0fe0729` (GOcelulares)
- **Key tables:** `deals`, `pipeline_stages`, `stage_history`, `users`, `contacts`, `deal_contacts`, `meetings`
- **Read-only:** All queries are SELECT only

## Architecture

```
.env.local
  └── KEYCONTACT_DB_URL

lib/keycontact.ts              ← Pool helper (same pattern as lib/db-pool.ts for GOcelular)
lib/actions/crm-keycontact.ts  ← Server actions: fetchPipelineDeals, fetchConversion, fetchMeetings, etc.

app/(admin)/terceros/crm/
  ├── page.tsx                 ← Server component, fetches all data, passes to tabs
  ├── CRMTabs.tsx              ← Client component wrapping FinanzasTabs
  ├── PipelineTab.tsx           ← Client component: stage summary cards + deals table
  ├── ConversionTab.tsx         ← Client component: funnel + rates + time metrics
  └── ReunionesTab.tsx          ← Client component: meetings KPI + table
```

## Tab 1: Pipeline

### Filter bar (top of tab)
- Pill presets: Semana, Mes, Trimestre (active = magenta pill style)
- Custom date inputs: Desde / Hasta with "Filtrar" button
- Dropdown: Etapa (all stages + "Todas")
- Dropdown: Owner (all users + "Todos")

### Stage summary cards
Horizontal row of mini-cards, one per active stage in funnel order:
- **Stage name** (header)
- **Deals actuales**: count of deals currently in that stage
- **Entradas**: count of `stage_history` rows where `to_stage_id = stage` within the period
- **Salidas**: count of `stage_history` rows where `from_stage_id = stage` within the period

Style: `bg-white rounded-xl border border-gray-200 p-4` in a horizontal scroll grid.

### Deals table
Standard table pattern (like Altas/Terceros):
- Columns: Comercio, Ciudad/Provincia, Sucursales, Etapa (colored badge), Owner, Lead Score, Última actividad
- Sorted by `created_at` DESC
- Filtered by time period (deal `created_at`), stage dropdown, owner dropdown
- Expandable row on click: shows primary contact name, email, phone

Queries:
```sql
-- Deals with stage, owner, primary contact
SELECT d.id, d.name, d.city, d.province, d.locations_count, d.lead_score, d.updated_at,
       ps.name AS stage_name, ps.slug AS stage_slug, ps.order_position,
       u.full_name AS owner_name,
       c.full_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone
FROM deals d
JOIN pipeline_stages ps ON ps.id = d.stage_id
JOIN users u ON u.id = d.owner_id
LEFT JOIN deal_contacts dc ON dc.deal_id = d.id AND dc.is_primary
LEFT JOIN contacts c ON c.id = dc.contact_id AND c.deleted_at IS NULL
WHERE d.pipeline_id = '<PIPELINE_ID>'
ORDER BY d.created_at DESC;

-- Stage entry/exit counts for period
SELECT to_stage_id, COUNT(*) AS entradas
FROM stage_history
WHERE to_stage_id IN (SELECT id FROM pipeline_stages WHERE pipeline_id = '<PIPELINE_ID>')
  AND created_at >= $desde AND created_at <= $hasta
GROUP BY to_stage_id;

SELECT from_stage_id, COUNT(*) AS salidas
FROM stage_history
WHERE from_stage_id IN (SELECT id FROM pipeline_stages WHERE pipeline_id = '<PIPELINE_ID>')
  AND from_stage_id IS NOT NULL
  AND created_at >= $desde AND created_at <= $hasta
GROUP BY from_stage_id;
```

### Stage badge colors
| Stage | Color |
|---|---|
| Prospecto | `bg-gray-100 text-gray-700` |
| Lead | `bg-blue-100 text-blue-700` |
| Reunión/Propuesta | `bg-indigo-100 text-indigo-700` |
| Seguimiento | `bg-purple-100 text-purple-700` |
| Parcialmente Ganado | `bg-amber-100 text-amber-700` |
| Ganado | `bg-emerald-100 text-emerald-700` |
| Perdido | `bg-red-100 text-red-700` |

## Tab 2: Conversión

### Filter bar
Same preset pills + custom date range as Pipeline tab.

### Funnel visual
Horizontal bars decreasing in width (same pattern as DesempenoClient.tsx funnel):
- Each bar = one stage, showing deal count and percentage
- Between bars: conversion rate label with arrow
- Colors: sequential blues/indigos/purples/greens matching badge colors
- Only open stages (Prospecto → Lead → Reunión → Seguimiento → Ganado/Parcialmente Ganado)

### Conversion rates (two cards side by side)

**Card 1 — Por etapa:**
Simple table showing each transition and its rate:
| Transición | Tasa |
|---|---|
| Prospecto → Lead | X% |
| Lead → Reunión/Propuesta | X% |
| Reunión → Seguimiento | X% |
| Seguimiento → Ganado | X% |

Calculated from `stage_history`: count of deals that moved from stage A to stage B / count of deals that were in stage A during the period.

**Card 2 — Total:**
Large metric: overall conversion rate from Prospecto to Ganado or Parcialmente Ganado.
- Numerator: deals that reached Ganado or Parcialmente Ganado in the period
- Denominator: deals that were in Prospecto in the period

### Time metrics

**Headline metric:** Tiempo promedio total Prospecto → Ganado (days). Calculated by summing `time_in_previous_stage_days` across all stages for deals that reached Ganado/Parcialmente Ganado.

**Table below:**
| Etapa | Tiempo promedio (días) |
|---|---|
| Prospecto | X |
| Lead | X |
| Reunión/Propuesta | X |
| Seguimiento | X |

Source: `stage_history.time_in_previous_stage_days` averaged by `from_stage_id`. Where `time_in_previous_stage_days` is NULL, fall back to calculating `created_at` difference between consecutive stage_history entries for the same deal.

## Tab 3: Reuniones

### Filter bar
Same preset pills + custom date range.

### KPI card
Single card showing total meetings in the period:
- Large number: count of meetings
- Label: "Reuniones agendadas"

### Meetings table
Standard table:
- Columns: Fecha (`scheduled_date`), Deal (deal name), Tipo (`meeting_type`), Estado (agendada if `executed_at` IS NULL, ejecutada otherwise, plus `outcome` if available)
- Sorted by `scheduled_date` DESC
- Filtered by time period on `scheduled_date`

Query:
```sql
SELECT m.id, m.scheduled_date, m.meeting_type, m.executed_at, m.outcome, m.duration_minutes,
       d.name AS deal_name
FROM meetings m
JOIN deals d ON d.id = m.deal_id
WHERE d.pipeline_id = '<PIPELINE_ID>'
  AND m.scheduled_date >= $desde AND m.scheduled_date <= $hasta
ORDER BY m.scheduled_date DESC;
```

## Hub integration

Add "CRM" card back to `/terceros` hub page (same position and style as before, blue color):
- href: `/terceros/crm`
- Title: CRM
- Description: "Pipeline GOcelulares — seguimiento comercial, conversión y reuniones"
- Icon: users group (same SVG as before)

## Environment

Add to `.env.local`:
```
KEYCONTACT_DB_URL="postgresql://postgres.piiovisvcuyzxmarshxk:mOwVClljWNazVT69@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"
```

Add to Vercel env vars (Production).

## Middleware

No changes needed — `/terceros/crm` is already covered by the admin route check in middleware.ts.
