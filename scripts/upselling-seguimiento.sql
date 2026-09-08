-- Seguimiento de upselling (/upselling): clientes con todas las cuotas pagas.
-- Clave = user_id de GOcuotas; guarda el tilde de contactado (con fecha, para
-- detectar recompras posteriores) y la nota libre de la gestión.
-- Ejecutado en Supabase el 8/9/2026.
CREATE TABLE IF NOT EXISTS upselling_seguimiento (
  user_id text PRIMARY KEY,
  contactado_at timestamptz,
  nota text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE upselling_seguimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON upselling_seguimiento;
CREATE POLICY admin_all ON upselling_seguimiento
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
