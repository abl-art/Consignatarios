-- Nombre: Rescates - tabla rescates_seguimiento
-- Seguimiento de rescates Andreani (pestaña Rescates de /compras/envios).
-- Clave = tracking del envío; guarda las cargas manuales (rescate solicitado
-- que todavía no aparece en shipments.traces → estado Pendiente de
-- aceptación) y el motivo del rescate. Cuando la API muestra la
-- SolicitudDeRescate, la fila se engancha con el flujo automático y aporta
-- solo el motivo. Mismo esquema RLS que siniestros_seguimiento.
CREATE TABLE IF NOT EXISTS rescates_seguimiento (
  tracking text PRIMARY KEY,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rescates_seguimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON rescates_seguimiento;
CREATE POLICY admin_all ON rescates_seguimiento
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
