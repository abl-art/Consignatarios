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
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Resuelto a mano con el botón Resolver (22/10/2026): ningún rescate se
  -- archiva solo — ni siquiera rendido — porque a veces el equipo no aparece
  -- en el depósito. NULL = pendiente de gestión.
  resuelto_at timestamptz
);
ALTER TABLE rescates_seguimiento ADD COLUMN IF NOT EXISTS resuelto_at timestamptz;
ALTER TABLE rescates_seguimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON rescates_seguimiento;
CREATE POLICY admin_all ON rescates_seguimiento
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
