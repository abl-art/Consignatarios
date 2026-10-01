-- Demoras de entrega: descartes manuales. Cuando los traces sincronizados de
-- GOcelular quedaron viejos (el sync se congela en algunos envíos) y el admin
-- verificó en Andreani que el envío se entregó, lo descarta de la pestaña.
CREATE TABLE IF NOT EXISTS demoras_descartes (
  tracking text PRIMARY KEY,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
