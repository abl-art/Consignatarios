CREATE TABLE IF NOT EXISTS cosechas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  filtros jsonb NOT NULL DEFAULT '{}',
  limite int,
  order_ids text[] NOT NULL,
  cant_ordenes int NOT NULL,
  cant_disponibles int NOT NULL,
  monto_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
