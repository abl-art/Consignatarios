-- Facturas de warehouse/fulfillment de Andreani (solapa Costos de /compras/envios)
-- Una factura por mes (Cte 123734, arranca ago 2026). El desglose por concepto
-- (IN Bulto, Almacén, Out Unidad, Insumos, Seguro) va en el jsonb `conceptos`
-- tal como viene en la hoja resumen del Excel; el detalle OUT se concilia
-- contra los expedidos de GOcelular por order_number.
CREATE TABLE IF NOT EXISTS facturas_warehouse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text UNIQUE NOT NULL,               -- 'YYYY-MM'
  fecha_factura date NOT NULL,                -- fecha del comprobante (pago a 30 días)
  total_facturado numeric NOT NULL,
  conceptos jsonb NOT NULL,                   -- [{item, detalle, cantidad, precio_unitario, total}]
  unidades_out integer NOT NULL,
  ordenes_out integer NOT NULL,
  bultos_in integer NOT NULL,
  unidades_in integer NOT NULL,
  recepciones integer NOT NULL,
  valor_pico_seguro numeric,
  fecha_pico_seguro date,
  seguro_diario jsonb,                        -- [{fecha, valor}] valor declarado por día
  out_conciliadas integer NOT NULL DEFAULT 0, -- órdenes expedidas confirmadas en GOcelular
  out_revisar integer NOT NULL DEFAULT 0,     -- órdenes facturadas sin expedición confirmada
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturas_warehouse_out (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  factura_id uuid NOT NULL REFERENCES facturas_warehouse(id) ON DELETE CASCADE,
  orden text NOT NULL,
  sku text,
  unidades integer NOT NULL,
  fecha_envio date,
  estado text NOT NULL,                       -- 'conciliado' | 'revisar'
  motivo text                                 -- estado GOcelular cuando no concilia
);
CREATE INDEX IF NOT EXISTS facturas_warehouse_out_factura_idx ON facturas_warehouse_out (factura_id);

CREATE TABLE IF NOT EXISTS facturas_warehouse_in (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  factura_id uuid NOT NULL REFERENCES facturas_warehouse(id) ON DELETE CASCADE,
  fecha date,
  proveedor text,
  remito text,
  pallets integer,
  bultos integer,
  unidades integer
);
CREATE INDEX IF NOT EXISTS facturas_warehouse_in_factura_idx ON facturas_warehouse_in (factura_id);

ALTER TABLE facturas_warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_warehouse_out ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_warehouse_in ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all ON facturas_warehouse;
CREATE POLICY admin_all ON facturas_warehouse
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
DROP POLICY IF EXISTS admin_all ON facturas_warehouse_out;
CREATE POLICY admin_all ON facturas_warehouse_out
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
DROP POLICY IF EXISTS admin_all ON facturas_warehouse_in;
CREATE POLICY admin_all ON facturas_warehouse_in
  USING ((auth.jwt() ->> 'user_metadata'::text) ~~ '%"rol":"admin"%'::text);
