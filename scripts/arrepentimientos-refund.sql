-- Auditoría del botón "Anular orden" (refund por API GOcuotas) en la cola de
-- arrepentimientos: cuándo se reembolsó y qué respondió la API.
alter table arrepentimientos add column if not exists refund_api_at timestamptz;
alter table arrepentimientos add column if not exists refund_api_detalle text;
