-- Devoluciones pedidas por el webhook de Pedro (solicitar_devolucion, contrato
-- 29/10/2026). La pestaña Devoluciones se arma de shipments type='return' de la
-- réplica, que puede tardar en reflejar el envío inverso recién creado: esta
-- tabla es el origen de la fila sintética "devolución pedida" hasta que el
-- shipment aparece (merge en getDevoluciones). Clave = order_number (una
-- devolución vigente por orden; repetir el apply devuelve la misma devolución).
-- Mismo esquema RLS que devoluciones_seguimiento.
CREATE TABLE IF NOT EXISTS devoluciones_pedidas (
  order_number text PRIMARY KEY,
  modalidad text NOT NULL,
  tracking text,
  estado text,
  request_id text,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE devoluciones_pedidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON devoluciones_pedidas;
CREATE POLICY admin_all ON devoluciones_pedidas
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
