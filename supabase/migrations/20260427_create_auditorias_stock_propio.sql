CREATE TABLE IF NOT EXISTS auditorias_stock_propio (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha_corte date NOT NULL,
  fecha_conteo date,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_conteo', 'firmada')),
  detalle jsonb NOT NULL DEFAULT '[]',
  total_teorico numeric NOT NULL DEFAULT 0,
  total_real numeric NOT NULL DEFAULT 0,
  total_diferencia numeric NOT NULL DEFAULT 0,
  valor_existencia_final numeric NOT NULL DEFAULT 0,
  firma_responsable text,
  firma_responsable_url text,
  firma_supervisor text,
  firma_supervisor_url text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auditorias_stock_propio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON auditorias_stock_propio FOR ALL
  USING (auth.jwt() ->> 'user_metadata'::text LIKE '%"rol":"admin"%');
