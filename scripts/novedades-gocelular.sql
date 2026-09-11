-- Novedades de GOcelular (webhook entrante de Pedro → cajita en Dashboard 360)
-- Nombre en Supabase SQL Editor: "novedades_gocelular — tabla + RLS"
CREATE TABLE IF NOT EXISTS novedades_gocelular (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  detalle text,
  tipo text,
  referencia text,
  created_at timestamptz NOT NULL DEFAULT now(),
  leida_at timestamptz
);
ALTER TABLE novedades_gocelular ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON novedades_gocelular;
CREATE POLICY admin_all ON novedades_gocelular
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
