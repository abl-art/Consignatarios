-- Traza e idempotencia de los reembolsos totales disparados desde Rescates y
-- Devoluciones (botón Anular orden, fix del review 29/10/2026): quién, cuándo,
-- desde qué contexto y la respuesta. La PK por orden GOcuotas es el candado:
-- la fila se inserta ANTES del DELETE a GOcuotas (conflicto = ya hay un
-- reembolso en curso o hecho) y se borra si el refund falla, para permitir el
-- reintento. Arrepentimientos conserva su propia marca (refund_api_at).
-- Mismo esquema RLS que devoluciones_seguimiento.
CREATE TABLE IF NOT EXISTS refunds_api (
  gocuotas_order_id text PRIMARY KEY,
  order_number text NOT NULL,
  usuario text,
  contexto text,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE refunds_api ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON refunds_api;
CREATE POLICY admin_all ON refunds_api
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
