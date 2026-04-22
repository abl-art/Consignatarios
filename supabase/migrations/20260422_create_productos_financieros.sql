CREATE TABLE IF NOT EXISTS productos_financieros (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre text NOT NULL,
  parametros jsonb NOT NULL,
  indicadores jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE productos_financieros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON productos_financieros FOR ALL
  USING (auth.jwt() ->> 'user_metadata'::text LIKE '%"rol":"admin"%');
