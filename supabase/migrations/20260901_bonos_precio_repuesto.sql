-- Marca de reajuste automático: el cron repone el precio pleno en la tienda
-- cuando la campaña vence o agota el cupo, y estampa acá cuándo lo hizo para
-- no volver a publicarla. Editar/extender el bono la limpia.
ALTER TABLE lista_precios_bonos ADD COLUMN IF NOT EXISTS precio_repuesto_at TIMESTAMPTZ;
