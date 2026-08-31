-- Bonos sell-out por modelo con historial y PDF de prueba de ventas.
-- Reemplaza las keys listaprecios_bono_<producto_id> de flujo_config (una sola
-- vigencia por producto, se pisaba al cargar el siguiente). Las keys viejas se
-- migran lazy desde el código (autocuración en getListaPrecios) para no romper
-- producción entre la migración y el deploy.
CREATE TABLE IF NOT EXISTS lista_precios_bonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES compras_productos(id) ON DELETE CASCADE,
  nombre_modelo TEXT NOT NULL,
  monto NUMERIC NOT NULL CHECK (monto > 0),
  desde DATE,
  hasta DATE,
  cupo INT CHECK (cupo > 0),
  pdf_url TEXT,
  pdf_generado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lista_precios_bonos_producto_idx ON lista_precios_bonos (producto_id);

ALTER TABLE lista_precios_bonos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON lista_precios_bonos FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role' OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin');

-- Bucket público para los PDFs de prueba de ventas (mismo esquema que 'facturas')
INSERT INTO storage.buckets (id, name, public) VALUES ('bonos', 'bonos', true)
  ON CONFLICT (id) DO NOTHING;
