-- Devoluciones cargadas A MANO en la pestaña Devoluciones de /compras/envios
-- (botón "Cargar devolución"): devoluciones generadas por fuera de GOcelular
-- (lado GOcuotas/Pedro) que no tienen shipment type='return' en la réplica.
-- Se guarda solo el vínculo pedido ↔ tracking; el resto de los datos de la
-- fila (cliente, producto, IMEI, seguimientos) se cruza en vivo al leer.
-- Ejecutado en Supabase el 13/11/2026. Mismo esquema RLS que
-- devoluciones_seguimiento.
CREATE TABLE IF NOT EXISTS devoluciones_manuales (
  tracking text PRIMARY KEY,
  -- Pedido tal como se cargó: SO-XXXXXX de la tienda o nro de orden GOcuotas
  order_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE devoluciones_manuales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON devoluciones_manuales;
CREATE POLICY admin_all ON devoluciones_manuales
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
