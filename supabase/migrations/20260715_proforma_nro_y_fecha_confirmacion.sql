-- Número de proforma (autoincremental desde 145 al confirmar)
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS nro_proforma integer;

-- Fecha de confirmación
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS fecha_confirmacion timestamptz;
