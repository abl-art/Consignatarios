-- Novedades SALIENTES hacia GOcelular (espejo del webhook entrante de Pedro):
-- historial de lo que el 360 le informó, con estado para reintentar fallidas.
-- La URL del endpoint receptor de Pedro vive en flujo_config key
-- 'gocelular_novedades_url' (se carga cuando Pedro la confirme).
CREATE TABLE IF NOT EXISTS novedades_enviadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  detalle text,
  tipo text,
  referencia text,
  estado text NOT NULL DEFAULT 'fallida' CHECK (estado IN ('enviada', 'fallida')),
  respuesta text,             -- request_id / status del último intento o mensaje de error
  enviada_at timestamptz,     -- cuándo llegó bien
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE novedades_enviadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON novedades_enviadas;
CREATE POLICY admin_all ON novedades_enviadas
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);

-- Contrato v2 (30/9/2026, ajustes de Pedro): id estable por novedad para
-- idempotencia y en_respuesta_a para hilar conversaciones. ALTERs ya corridos.
-- ALTER TABLE novedades_gocelular ADD COLUMN IF NOT EXISTS id_externo text, ADD COLUMN IF NOT EXISTS en_respuesta_a text;
-- CREATE UNIQUE INDEX IF NOT EXISTS novedades_gocelular_id_externo_uq ON novedades_gocelular(id_externo) WHERE id_externo IS NOT NULL;
-- ALTER TABLE novedades_enviadas ADD COLUMN IF NOT EXISTS en_respuesta_a text;
