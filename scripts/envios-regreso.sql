-- Pestaña "Pendiente de regreso" de /compras/envios (17/11/2026, pedido de Emiliano):
-- envíos outbound que Andreani marcó "No entregado" (dos visitas fallidas + no
-- retirado en sucursal → vuelve por proceso) y que no están en ninguna otra
-- pestaña (sin rescate, siniestro, arrepentimiento ni devolución pedida).
-- Cache permanente de consultas a la API pública de Andreani: un tracking con
-- estado terminal (entregado / pendiente_regreso) no se vuelve a consultar.
-- Ejecutado en Supabase el 17/11/2026. Mismo esquema RLS que devoluciones_manuales.
CREATE TABLE IF NOT EXISTS envios_regreso (
  tracking text PRIMARY KEY,
  -- 'entregado' (archivado, no se consulta más) | 'pendiente_regreso' (va a la
  -- pestaña) | 'en_viaje' (se re-chequea a los 7 días)
  estado text NOT NULL CHECK (estado IN ('entregado', 'pendiente_regreso', 'en_viaje')),
  estado_andreani text,
  fecha_ultimo_evento text,
  consultado_at timestamptz NOT NULL DEFAULT now(),
  detectado_at timestamptz,
  recibido_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE envios_regreso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON envios_regreso;
CREATE POLICY admin_all ON envios_regreso
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
