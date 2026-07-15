CREATE TABLE IF NOT EXISTS pase_contabilidad_transito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text NOT NULL,
  pedido_id text NOT NULL,
  categoria text NOT NULL,
  proveedor text NOT NULL,
  items jsonb NOT NULL,
  unidades integer NOT NULL,
  valuacion numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(periodo, pedido_id)
);

CREATE INDEX idx_pase_transito_periodo ON pase_contabilidad_transito(periodo);
