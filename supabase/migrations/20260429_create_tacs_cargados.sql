CREATE TABLE IF NOT EXISTS tacs_cargados (
  tac text PRIMARY KEY,
  marca text NOT NULL,
  modelo text NOT NULL,
  origen text NOT NULL DEFAULT 'inventario' CHECK (origen IN ('inventario', 'terceros')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tacs_cargados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON tacs_cargados FOR ALL
  USING (auth.jwt() ->> 'user_metadata'::text LIKE '%"rol":"admin"%');
