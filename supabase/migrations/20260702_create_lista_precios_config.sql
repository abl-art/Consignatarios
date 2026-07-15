-- Config for Lista de Precios MUP
CREATE TABLE IF NOT EXISTS lista_precios_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mup NUMERIC NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed singleton row
INSERT INTO lista_precios_config (id, mup) VALUES (1, 30)
  ON CONFLICT (id) DO NOTHING;

-- Add oculto_lista_precios column to compras_productos if missing
ALTER TABLE compras_productos ADD COLUMN IF NOT EXISTS oculto_lista_precios BOOLEAN DEFAULT false;

-- RLS
ALTER TABLE lista_precios_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON lista_precios_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role' OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin');
