-- Prestamos (bullet y descubierto)
CREATE TABLE IF NOT EXISTS deuda_prestamos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo text NOT NULL CHECK (tipo IN ('bullet', 'descubierto')),
  monto_capital numeric NOT NULL,
  tasa_anual numeric NOT NULL,
  fecha_toma date NOT NULL,
  plazo_dias integer,
  fecha_vencimiento date,
  saldo_capital numeric NOT NULL,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'cancelado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deuda_prestamos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON deuda_prestamos FOR ALL
  USING (auth.jwt() ->> 'user_metadata'::text LIKE '%"rol":"admin"%');

-- Movimientos de deuda (tomas, devoluciones, pagos de interes)
CREATE TABLE IF NOT EXISTS deuda_movimientos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  prestamo_id uuid NOT NULL REFERENCES deuda_prestamos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('toma', 'devolucion', 'interes')),
  monto numeric NOT NULL,
  fecha date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deuda_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON deuda_movimientos FOR ALL
  USING (auth.jwt() ->> 'user_metadata'::text LIKE '%"rol":"admin"%');

-- Config defaults
INSERT INTO flujo_config (key, value, updated_at)
VALUES
  ('deuda_tasa_bullet', '0.45', now()),
  ('deuda_tasa_descubierto', '0.55', now()),
  ('deuda_limite', '1000000000', now()),
  ('deuda_saldo_minimo', '1000000', now())
ON CONFLICT (key) DO NOTHING;
