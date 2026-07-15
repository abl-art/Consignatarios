-- Tabla de cheques sincronizados desde Google Sheet
CREATE TABLE IF NOT EXISTS cheques_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuit text NOT NULL,
  nombre text,
  numero_cheque text,
  importe numeric NOT NULL,
  fecha_pago date NOT NULL,
  estado_cheque text,
  synced_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cheques_proveedor_cuit ON cheques_proveedor (cuit);
CREATE INDEX IF NOT EXISTS idx_cheques_proveedor_fecha ON cheques_proveedor (fecha_pago);

-- Campo límite de cuenta corriente en proveedores
ALTER TABLE compras_proveedores ADD COLUMN IF NOT EXISTS limite_cuenta_corriente numeric;
