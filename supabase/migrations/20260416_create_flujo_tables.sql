-- Migration: Create flujo_asistencias and flujo_egresos tables
-- Date: 2026-04-16

CREATE TABLE IF NOT EXISTS flujo_asistencias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha date NOT NULL,
  monto numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flujo_egresos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  flujo_dia date NOT NULL,
  concepto text NOT NULL CHECK (concepto IN ('Celulares','Licencias','Descartables','Sueldos','Envios','Interes','Otros')),
  medio_de_pago text NOT NULL DEFAULT 'Efectivo',
  cuotas integer NOT NULL DEFAULT 1,
  monto numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE flujo_asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE flujo_egresos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON flujo_asistencias FOR ALL
  USING (auth.jwt() ->> 'user_metadata'::text LIKE '%"rol":"admin"%');

CREATE POLICY "admin_all" ON flujo_egresos FOR ALL
  USING (auth.jwt() ->> 'user_metadata'::text LIKE '%"rol":"admin"%');
