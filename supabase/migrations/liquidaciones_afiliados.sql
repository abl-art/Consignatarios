-- Liquidaciones de Afiliados
-- Ejecutar manualmente en Supabase Dashboard antes del deploy

CREATE TABLE liquidaciones_afiliados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_slug VARCHAR NOT NULL,
  partner_name VARCHAR NOT NULL,
  mes VARCHAR(7) NOT NULL,
  total_comisiones NUMERIC NOT NULL,
  monto_a_pagar NUMERIC NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  factura_url TEXT,
  fecha_pago DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_slug, mes)
);

ALTER TABLE liquidaciones_afiliados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura publica de liquidaciones afiliados"
  ON liquidaciones_afiliados FOR SELECT
  USING (true);

CREATE POLICY "Insert desde service role"
  ON liquidaciones_afiliados FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Update desde service role"
  ON liquidaciones_afiliados FOR UPDATE
  USING (true);
