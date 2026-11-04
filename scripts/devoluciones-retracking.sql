-- Re-tracking manual de devoluciones (4/11/2026): cuando la generación por el
-- circuito de Pedro falla y Andreani carga los envíos A MANO en andreani.com,
-- el tracking vigente es el nuevo y el del shipment return de la réplica queda
-- muerto. Esta tabla mapea orden → tracking vigente; la pestaña Devoluciones
-- lo prefiere al de la réplica (consulta Andreani con este) y muestra el chip
-- "manual". Primer uso: operación Andreani 1172302 (46 devoluciones, 3/11).
-- EJECUTADA en prod el 4/11/2026.
CREATE TABLE IF NOT EXISTS devoluciones_retracking (
  order_number text PRIMARY KEY,
  tracking text NOT NULL,
  fuente text,
  created_at timestamptz NOT NULL DEFAULT now()
);
