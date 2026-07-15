-- Tabla de clientes mayoristas
CREATE TABLE IF NOT EXISTS clientes_mayoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_comercial text NOT NULL,
  razon_social text,
  condicion_iva text NOT NULL DEFAULT 'monotributo',
  cuit text,
  telefono text,
  email text,
  direccion_entrega text,
  transporte text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE clientes_mayoristas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access clientes_mayoristas" ON clientes_mayoristas
  FOR ALL USING (true) WITH CHECK (true);

-- FK en proformas para vincular al cliente mayorista
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS cliente_mayorista_id uuid REFERENCES clientes_mayoristas(id);
