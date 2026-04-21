-- Add store_name to ventas (identifies which GOcelular store made the sale)
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS store_name text;

-- Add store_prefix to consignatarios (validates which store belongs to which consignee)
ALTER TABLE consignatarios ADD COLUMN IF NOT EXISTS store_prefix text;

-- Sync log: tracks each GOcelular sync run
CREATE TABLE IF NOT EXISTS sync_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  ventas_nuevas integer NOT NULL DEFAULT 0,
  ventas_ya_existentes integer NOT NULL DEFAULT 0,
  dispositivos_no_encontrados integer NOT NULL DEFAULT 0,
  errores_monitoreo integer NOT NULL DEFAULT 0,
  error_msg text,
  detalle jsonb,
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON sync_log FOR ALL
  USING (auth.jwt() ->> 'user_metadata'::text LIKE '%"rol":"admin"%');
