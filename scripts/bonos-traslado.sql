-- Bonos sell-out: traslado parcial al precio (2026-09-15)
-- traslado = $ c/IVA que efectivamente se descuentan del PVP publicado.
-- NULL = se traslada el bono completo (comportamiento histórico).
-- La NC de la marca se calcula SIEMPRE sobre monto, no sobre traslado.
ALTER TABLE lista_precios_bonos
  ADD COLUMN IF NOT EXISTS traslado numeric;
