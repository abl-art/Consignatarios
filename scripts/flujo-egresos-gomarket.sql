-- Renombre de columnas de egresos del Flujo de fondos (16/11/2026, pedido de Emiliano):
-- GOcelulares (ex Celulares) y GOmarket (ex Descartables; sus egresos pasan a Otros).
-- El check viejo ni siquiera permitía 'Vta Terceros' aunque el form lo ofrecía — se agrega.
-- Ejecutado en Supabase el 16/11/2026 con run-sql.mjs.
ALTER TABLE flujo_egresos DROP CONSTRAINT IF EXISTS flujo_egresos_concepto_check;
UPDATE flujo_egresos SET concepto = 'Otros' WHERE concepto = 'Descartables';
UPDATE flujo_egresos SET concepto = 'GOcelulares' WHERE concepto = 'Celulares';
ALTER TABLE flujo_egresos ADD CONSTRAINT flujo_egresos_concepto_check
  CHECK (concepto = ANY (ARRAY['GOcelulares'::text, 'GOmarket'::text, 'Licencias'::text, 'Sueldos'::text, 'Envios'::text, 'Interes'::text, 'Vta Terceros'::text, 'Otros'::text]));
