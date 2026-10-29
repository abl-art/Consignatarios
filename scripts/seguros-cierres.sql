-- Seguros por Robo: cierres mensuales congelados. Un snapshot inmutable por
-- mes (resumen de devengo + conteos por estado + filas del Excel del broker),
-- generado por congelarCierre (lib/actions/seguros.ts) y disparado por el cron
-- del día 1 de cada mes (app/api/cron/seguros-cierre/route.ts).
-- Sin RLS: mismo patrón del repo (solo el service role escribe).
--
-- Re-ejecutable: CREATE usa IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS seguros_cierres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes text NOT NULL UNIQUE,
  congelado_at timestamptz NOT NULL DEFAULT now(),
  resumen jsonb NOT NULL,
  filas_excel jsonb NOT NULL
);
