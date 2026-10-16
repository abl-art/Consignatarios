-- Seguimiento de siniestros Andreani (pestaña Siniestros de /compras/envios)
-- Ejecutado en Supabase el 2/9/2026. Clave = tracking del envío; guarda las
-- cargas manuales y el tilde de nota de crédito emitida.
CREATE TABLE IF NOT EXISTS siniestros_seguimiento (
  tracking text PRIMARY KEY,
  nota_credito boolean NOT NULL DEFAULT false,
  nota_credito_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Marcado como resuelto (16/10/2026): los resueltos van a la lista colapsable
-- del pie de la pestaña Siniestros Distribución. NULL = pendiente de gestión.
ALTER TABLE siniestros_seguimiento ADD COLUMN IF NOT EXISTS resuelto_at timestamptz;
ALTER TABLE siniestros_seguimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON siniestros_seguimiento;
CREATE POLICY admin_all ON siniestros_seguimiento
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
