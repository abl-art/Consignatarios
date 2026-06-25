-- Config for Estado de Resultado (P&L) calculations
CREATE TABLE config_resultado (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clave TEXT UNIQUE NOT NULL,
  valor NUMERIC NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('fijo', 'porcentaje', 'financiero')),
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial values
INSERT INTO config_resultado (clave, valor, tipo, label) VALUES
  ('kit_seguridad', 7000, 'fijo', 'Kit de Seguridad'),
  ('envio_fulfillment', 15000, 'fijo', 'Envío + Fulfillment'),
  ('sueldos', 1250, 'fijo', 'Sueldos'),
  ('otros', 1000, 'fijo', 'Otros'),
  ('adquirencia', 0.8, 'porcentaje', 'Adquirencia'),
  ('incobrables', 6.5, 'porcentaje', 'Incobrables'),
  ('tna', 27, 'financiero', 'TNA (%)'),
  ('plazo_pago_proveedor', 60, 'financiero', 'Plazo pago proveedor (días)');

-- RLS
ALTER TABLE config_resultado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON config_resultado FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role' OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin');
