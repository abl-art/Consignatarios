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
  ADD COLUMN IF NOT EXISTS entrega_provincia text;

ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'stock_local',
  ADD COLUMN IF NOT EXISTS gocelular jsonb;

ALTER TABLE proformas DROP CONSTRAINT IF EXISTS proformas_origen_check;
ALTER TABLE proformas ADD CONSTRAINT proformas_origen_check CHECK (origen IN ('stock_local', 'andreani_wh'));

-- Task 4 (orquestador): el diseño (docs/superpowers/specs/2026-08-12-gocelular-wholesale-webhook-design.md,
-- tabla "Payload") asume `proforma.store_id` como fuente del `gocuotas_store_id` a informar, pero esa
-- columna NUNCA se agregó — quedó como campo vestigial en la interfaz TS `Proforma` (lib/actions/proformas.ts)
-- desde un esquema anterior de "consignatarios/proformas" (commit 57c733d) cuya columna real fue eliminada
-- de Supabase en algún momento no documentado en el repo (verificado: SELECT store_id FROM proformas LIMIT 1
-- -> "column proformas.store_id does not exist", 2026-08-12). La agrego acá porque bloquea por completo el
-- pipeline de Task 4: sin ella, ninguna proforma puede resolver su store de GOcelular.
-- IMPORTANTE — no hay (todavía) ningún punto de la UI que la complete: crearProforma/modificarProforma no la
-- aceptan y Task 5 (UI, spec) no la menciona. Hasta que se agregue esa entrada de datos (o se decida que el
-- store_id sale de `clientes_mayoristas` en vez de `proformas`), toda proforma stock_local/andreani_wh va a
-- fallar la pre-validación con "El store '' no existe en GOcelular" — comportamiento intencional y
-- documentado (ver task-4-report.md), no un bug de esta migración.
ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS store_id text;
