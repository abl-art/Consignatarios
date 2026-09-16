-- Cortes del control de stock Andreani vs GOcelular (solapa Control Stock).
-- Pedido de Emiliano (16 sep 2026): nada en tiempo real — un corte por cada
-- corrida del job de Pedro (00:44/06:44/12:44/18:44 UTC). Nuestro cron corre
-- a los :50 (pg_cron job control-stock-corte), lee la última corrida medida
-- de wh_stock_readings y guarda el comparable GO calculado EN ESE MOMENTO.
-- La corrida de las 00:44 falla siempre (mantenimiento Andreani): a las 00:50
-- la última medida ya tiene corte y se saltea sola.
CREATE TABLE IF NOT EXISTS control_stock_cortes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz UNIQUE NOT NULL,   -- corrida de wh_stock_readings
  corte_at timestamptz NOT NULL,        -- cuándo se midió el lado GOcelular
  en_cola jsonb,                        -- [{nombre, unidades}] vendido en cola (solo GO, por modelo)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_stock_cortes_detalle (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  corte_id uuid NOT NULL REFERENCES control_stock_cortes(id) ON DELETE CASCADE,
  sku text NOT NULL,
  nombre text,
  and_total integer NOT NULL DEFAULT 0,
  and_disponible integer NOT NULL DEFAULT 0,
  go_andreani integer NOT NULL DEFAULT 0,   -- available en andreani_wh al corte
  go_enviados integer NOT NULL DEFAULT 0,   -- pedidos enviados sin pickear al corte
  go_local integer NOT NULL DEFAULT 0,
  go_transito integer NOT NULL DEFAULT 0,
  dif integer NOT NULL DEFAULT 0,           -- and_disponible − (go_andreani − go_enviados)
  medido boolean NOT NULL DEFAULT true,
  error text
);
CREATE INDEX IF NOT EXISTS control_stock_cortes_detalle_corte_idx ON control_stock_cortes_detalle (corte_id);

ALTER TABLE control_stock_cortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_stock_cortes_detalle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON control_stock_cortes;
CREATE POLICY admin_all ON control_stock_cortes
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
DROP POLICY IF EXISTS admin_all ON control_stock_cortes_detalle;
CREATE POLICY admin_all ON control_stock_cortes_detalle
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);

-- pg_cron (ejecutado aparte, requiere CRON_SECRET):
-- SELECT cron.schedule('control-stock-corte', '50 0,6,12,18 * * *', $$
--   SELECT net.http_get(
--     url := 'https://gocelular360.vercel.app/api/cron/control-stock',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
--     timeout_milliseconds := 55000)
-- $$);
