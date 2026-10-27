-- Auditoría del botón "Cancelar pedido" (API de cancelaciones del warehouse
-- de GOcelular, contrato 27/10/2026): cuándo se aplicó y qué respondió.
alter table arrepentimientos add column if not exists cancelacion_wh_at timestamptz;
alter table arrepentimientos add column if not exists cancelacion_wh_detalle text;
