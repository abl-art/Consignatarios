-- Plataforma de cada producto del gestor de compras: a qué sistema se informa
-- la compra. 'gocelular' (webhook de compras clásico) o 'gomarket' (webhook
-- Commerce v1 /api/webhooks/commerce/v1/purchases). Corrido en prod 22 sep 2026.
ALTER TABLE compras_productos
  ADD COLUMN IF NOT EXISTS plataforma text NOT NULL DEFAULT 'gocelular';

ALTER TABLE compras_productos
  DROP CONSTRAINT IF EXISTS compras_productos_plataforma_check;
ALTER TABLE compras_productos
  ADD CONSTRAINT compras_productos_plataforma_check
  CHECK (plataforma IN ('gocelular', 'gomarket'));
