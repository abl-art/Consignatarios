-- Existencia final mensual de accesorios (store_products de GOcelulares)
CREATE TABLE IF NOT EXISTS stock_cierre_mensual (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  periodo text NOT NULL,            -- 'YYYY-MM' ej: '2026-05'
  categoria text NOT NULL,          -- 'smartwatches' | 'parlantes' | 'auriculares'
  producto text NOT NULL,           -- nombre unificado del producto
  stock_final int NOT NULL,         -- unidades disponibles al cierre
  precio_unitario numeric NOT NULL, -- precio unitario al momento del cierre
  valuacion numeric NOT NULL,       -- stock_final * precio_unitario
  created_at timestamptz DEFAULT now(),
  UNIQUE(periodo, categoria)
);

CREATE INDEX idx_stock_cierre_categoria ON stock_cierre_mensual(categoria, periodo);
