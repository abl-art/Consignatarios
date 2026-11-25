-- Cierre de stock options (salida del colaborador): deja de devengar en
-- cierre_fecha con dos destinos — 'recompra' (la empresa paga lo devengado:
-- cierre_monto_usd, congelado) o 'conserva' (mantiene lo devengado al cierre,
-- que sigue valuandose con la empresa). NULL = vigente.
alter table fc_grupogo_stock_options
  add column if not exists cierre_fecha date,
  add column if not exists cierre_tipo text,
  add column if not exists cierre_monto_usd numeric;
