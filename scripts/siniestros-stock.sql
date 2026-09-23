-- Siniestros de almacenamiento / diferencias de stock (pestaña Siniestros de
-- /compras/envios): equipos extraviados, rotos o hurtados en el depósito, sin
-- guía de Andreani. Producto obligatorio (desplegable del catálogo), IMEI
-- opcional. Ejecutado en Supabase el 23/9/2026 (vía pooler).
CREATE TABLE IF NOT EXISTS siniestros_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto text NOT NULL,
  sku text,
  imei text,
  tipo text NOT NULL CHECK (tipo IN ('extraviado', 'roto', 'hurtado')),
  fecha date NOT NULL DEFAULT current_date,
  nota text,
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'resuelto')),
  resuelto_at timestamptz,
  nota_credito boolean NOT NULL DEFAULT false,
  nota_credito_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE siniestros_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON siniestros_stock;
CREATE POLICY admin_all ON siniestros_stock
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
