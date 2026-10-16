-- Seguimiento manual de devoluciones (pestaña Devoluciones de /compras/envios)
-- Ejecutado en Supabase el 16/10/2026. Clave = tracking del envío de RETORNO;
-- guarda el tilde "Recibido WH GO" (el equipo entró físicamente al depósito
-- de GOcuotas). Mismo esquema RLS que siniestros_seguimiento.
CREATE TABLE IF NOT EXISTS devoluciones_seguimiento (
  tracking text PRIMARY KEY,
  recibido_wh boolean NOT NULL DEFAULT false,
  recibido_wh_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE devoluciones_seguimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON devoluciones_seguimiento;
CREATE POLICY admin_all ON devoluciones_seguimiento
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
