-- 2026-08-12 · Webhook venta mayorista GOcelular: campos de entrega + plazo en clientes, origen + estado en proformas
ALTER TABLE clientes_mayoristas
  ADD COLUMN IF NOT EXISTS plazo_dias integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS entrega_nombre text,
  ADD COLUMN IF NOT EXISTS entrega_dni text,
  ADD COLUMN IF NOT EXISTS entrega_telefono text,
  ADD COLUMN IF NOT EXISTS entrega_email text,
  ADD COLUMN IF NOT EXISTS entrega_calle text,
  ADD COLUMN IF NOT EXISTS entrega_numero text,
  ADD COLUMN IF NOT EXISTS entrega_piso_depto text,
  ADD COLUMN IF NOT EXISTS entrega_localidad text,
  ADD COLUMN IF NOT EXISTS entrega_cp text,
  ADD COLUMN IF NOT EXISTS entrega_provincia text,
  -- Decisión del controller (fix-review de Task 4, 2026-08-12): el gocuotas_store_id vive en el
  -- CLIENTE (no en la proforma) — cada cliente mayorista vende siempre a través del mismo local
  -- de GOcelular. Reemplaza el intento original de este task de agregar `proformas.store_id`
  -- (ver historial: esa columna nunca existió en Supabase y el diseño original la asumía mal).
  ADD COLUMN IF NOT EXISTS gocuotas_store_id text;

ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'stock_local',
  ADD COLUMN IF NOT EXISTS gocelular jsonb;

ALTER TABLE proformas DROP CONSTRAINT IF EXISTS proformas_origen_check;
ALTER TABLE proformas ADD CONSTRAINT proformas_origen_check CHECK (origen IN ('stock_local', 'andreani_wh'));
