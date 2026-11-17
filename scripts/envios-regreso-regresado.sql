-- Estado 'regresado' (17/11/2026, reclamo de Emiliano sobre IMEI 865289070565562):
-- un pendiente_regreso se auto-resuelve cuando el IMEI del envío fallido salió
-- después en otro envío (re-venta) o volvió como disponible al inventario — el
-- equipo ya regresó aunque nadie lo haya marcado. El cron corre la resolución
-- en cada corrida. Ejecutado en Supabase el 17/11/2026.
ALTER TABLE envios_regreso DROP CONSTRAINT IF EXISTS envios_regreso_estado_check;
ALTER TABLE envios_regreso ADD CONSTRAINT envios_regreso_estado_check
  CHECK (estado IN ('entregado', 'pendiente_regreso', 'en_viaje', 'sin_despacho', 'regresado'));
