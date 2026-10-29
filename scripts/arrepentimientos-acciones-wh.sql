-- Acciones de Andreani por el webhook de Pedro (contrato 29/10/2026) desde la
-- cola de Arrepentimientos: marca de disparo + respuesta persistida (incluye
-- request_id) para rescate y devolución, espejo de cancelacion_wh_at. La marca
-- es la idempotencia del botón: con *_wh_at seteado no se re-dispara el apply.
ALTER TABLE arrepentimientos ADD COLUMN IF NOT EXISTS rescate_wh_at timestamptz;
ALTER TABLE arrepentimientos ADD COLUMN IF NOT EXISTS rescate_wh_detalle text;
ALTER TABLE arrepentimientos ADD COLUMN IF NOT EXISTS devolucion_wh_at timestamptz;
ALTER TABLE arrepentimientos ADD COLUMN IF NOT EXISTS devolucion_wh_detalle text;
