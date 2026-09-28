-- Proyecciones de ventas congeladas (tarjeta del Dashboard 360 y página
-- /canales/proyeccion). Un run por mes (día 1, cron congelar-proyecciones):
-- guarda el índice estacional de GOcuotas usado y la proyección a 5 meses
-- (mes del run + 4) por método y dimensión. El "Proyectado vs Real" de un
-- mes cerrado compara contra el run más reciente que lo proyectó sin
-- haberlo visto (run_mes <= mes).
CREATE TABLE IF NOT EXISTS proyecciones_runs (
  run_mes text PRIMARY KEY,            -- 'YYYY-MM' del congelado
  indice jsonb NOT NULL,               -- índice estacional {'01': 0.83, ...}
  serie_gocuotas jsonb NOT NULL,       -- serie mensual de GOcuotas usada [{mes, n}]
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proyecciones_ventas (
  run_mes text NOT NULL REFERENCES proyecciones_runs(run_mes) ON DELETE CASCADE,
  metodo text NOT NULL CHECK (metodo IN ('hibrido', 'gocuotas')),
  nivel text NOT NULL CHECK (nivel IN ('total', 'propia', 'terceros', 'merchant', 'store')),
  client_id text NOT NULL DEFAULT '',  -- solo nivel merchant
  store_id text NOT NULL DEFAULT '',   -- solo nivel store
  mes text NOT NULL,                   -- mes proyectado 'YYYY-MM'
  ventas numeric NOT NULL,
  monto numeric NOT NULL,
  PRIMARY KEY (run_mes, metodo, nivel, client_id, store_id, mes)
);

ALTER TABLE proyecciones_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecciones_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON proyecciones_runs;
CREATE POLICY admin_all ON proyecciones_runs
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
DROP POLICY IF EXISTS admin_all ON proyecciones_ventas;
CREATE POLICY admin_all ON proyecciones_ventas
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
