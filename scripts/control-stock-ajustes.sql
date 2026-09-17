-- Ajustes conocidos del control de stock: despachos sin IMEI que inflan el
-- available de GOcelular (fantasmas). Fuente: novedades de Pedro. Se cargan a
-- mano (los mantiene el asistente al leer las novedades). La capa de
-- descomposición los resta de la diferencia por modelo, con cap = |dif|:
-- nunca explica más de lo que la dif muestra (si Pedro compensa un fantasma,
-- la dif baja sola y el ajuste deja de restar; al confirmarlo, vigente=false).

CREATE TABLE IF NOT EXISTS control_stock_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  so_ref text,                                   -- SO-* de trazabilidad
  unidades int NOT NULL DEFAULT 1,
  motivo text NOT NULL DEFAULT 'despacho_sin_imei',
  novedad_id uuid,                               -- novedad de Pedro de origen (informativo)
  vigente boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS control_stock_ajustes_sku_idx ON control_stock_ajustes (sku) WHERE vigente;

ALTER TABLE control_stock_ajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON control_stock_ajustes;
CREATE POLICY admin_all ON control_stock_ajustes
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);

-- Carga inicial: 11 despachos sin IMEI sin compensar (novedad de Pedro 16/9/2026).
-- Una fila por orden fantasma (SO-ref), unidades = 1 c/u.
INSERT INTO control_stock_ajustes (sku, so_ref, motivo) VALUES
  ('NM2L15G',        'SO-SDYXBQ', 'despacho_sin_imei'),
  ('MZB0JDOAR',      'SO-UT7BFE', 'despacho_sin_imei'),
  ('MZB0KBXAR',      'SO-T6HPNV', 'despacho_sin_imei'),
  ('PB970105AR',     'SO-FF9HBE', 'despacho_sin_imei'),
  ('PB970105AR',     'SO-TZ7UHW', 'despacho_sin_imei'),
  ('SM-A075MZKAARO', 'SO-NMKLWH', 'despacho_sin_imei'),
  ('SM-A075MZKAARO', 'SO-YDM4CC', 'despacho_sin_imei'),
  ('SM-A075MZKWARO', 'SO-B7GV7H', 'despacho_sin_imei'),
  ('SM-A175FZKFLEA', 'SO-VE6KQ2', 'despacho_sin_imei'),
  ('SM-A175FZKFLEA', 'SO-YXAVKD', 'despacho_sin_imei'),
  ('PBBJ0012AR',     'SO-PFFUVR', 'despacho_sin_imei');
