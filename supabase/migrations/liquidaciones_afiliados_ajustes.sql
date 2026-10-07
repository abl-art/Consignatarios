-- Ajustes por anulaciones post-liquidación (arrepentimientos) en
-- liquidaciones de afiliados. Ejecutar manualmente en Supabase Dashboard
-- antes del deploy.

-- Órdenes que entraron en una liquidación ya generada y después se anularon.
-- Una fila por orden = registro de "ya descontada" (evita doble descuento)
-- + detalle para mostrar en la página y el PDF.
CREATE TABLE liquidaciones_afiliados_ajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,  -- store_orders.id::text (GOcelular DB)
  order_number VARCHAR,
  partner_slug VARCHAR NOT NULL,
  mes_original VARCHAR(7) NOT NULL,  -- mes en cuya liquidación se pagó la comisión
  mes_aplicado VARCHAR(7) NOT NULL,  -- mes de la liquidación donde se descuenta
  comision NUMERIC NOT NULL,         -- monto positivo; se resta en la liquidación
  producto TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(order_id)
);

ALTER TABLE liquidaciones_afiliados_ajustes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura publica de ajustes afiliados"
  ON liquidaciones_afiliados_ajustes FOR SELECT
  USING (true);

CREATE POLICY "Insert desde service role"
  ON liquidaciones_afiliados_ajustes FOR INSERT
  WITH CHECK (true);

-- Desglose nuevo en liquidaciones: monto_a_pagar = total_comisiones + ajustes + saldo_anterior
ALTER TABLE liquidaciones_afiliados
  ADD COLUMN ajustes NUMERIC NOT NULL DEFAULT 0,          -- siempre <= 0
  ADD COLUMN saldo_anterior NUMERIC NOT NULL DEFAULT 0;   -- siempre <= 0

-- Estado nuevo: 'compensada' = monto_a_pagar <= 0, no se paga ni pide factura;
-- el saldo negativo se arrastra como saldo_anterior del mes siguiente.
