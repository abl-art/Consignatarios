-- Ajustes tras el barrido inicial (17/11/2026):
-- 1) estado nuevo 'sin_despacho' = "Pendiente de ingreso" en Andreani (etiqueta
--    que nunca se despachó: terminal, no se re-consulta).
-- 2) Las filas ya guardadas con ese estado se reclasifican sin re-consultar.
-- 3) Se borran las filas de trackings placeholder (API0000170…): no existen en
--    Andreani (body null) y el candidato ya los filtra por regex numérica.
-- Ejecutado en Supabase el 17/11/2026.
ALTER TABLE envios_regreso DROP CONSTRAINT IF EXISTS envios_regreso_estado_check;
ALTER TABLE envios_regreso ADD CONSTRAINT envios_regreso_estado_check
  CHECK (estado IN ('entregado', 'pendiente_regreso', 'en_viaje', 'sin_despacho'));
UPDATE envios_regreso SET estado = 'sin_despacho' WHERE estado = 'en_viaje' AND estado_andreani = 'Pendiente de ingreso';
DELETE FROM envios_regreso WHERE estado_andreani IS NULL AND tracking !~ '^[0-9]{10,}$';
-- (agregado en la misma corrida) Trackings numéricos que Andreani no conoce
-- (body null): etiquetas con número asignado que nunca ingresaron — terminal.
UPDATE envios_regreso SET estado = 'sin_despacho', estado_andreani = 'Desconocido en Andreani'
  WHERE estado_andreani IS NULL AND estado = 'en_viaje';
