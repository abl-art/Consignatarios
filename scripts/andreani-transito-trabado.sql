-- ============================================================================
-- Tránsito trabado a Andreani — diagnóstico y corrección
--
-- Contexto (relevado el 2026-08-16 contra la DB de GOcelular, solo lectura):
--   470 celulares quedaron con physical_location = 'in_transit_andreani' desde
--   julio y nunca pasaron a 'andreani_wh':
--     · Motorola Moto G06 4/128GB (XT2536 (g06))  340 u  — lotes del 11/7 al 1/8
--     · Motorola Moto G06 64gb     (XT2535 (g06))  130 u  — lotes del 10/7 al 27/7
--   (además: 20 Xiaomi Redmi 14C 256/4GB desde el 30/7. Los 50 Redmi Note 14
--    del 14/8 sí son un envío en curso legítimo.)
--
--   Ninguna de esas filas tiene andreani_received_at. Todo lo que sí está en el
--   warehouse entró por intakes del 6/8 en adelante y sí lo tiene. Las filas
--   trabadas conviven con filas del mismo lote y mismo día que quedaron en
--   'local' (ej. lote intake-18dea8a4… del 14/7: 160 en tránsito + 30 local),
--   así que parece un cambio de ubicación aplicado a medias en el intake, no un
--   envío real demorado.
--
-- Impacto: `fetchStockPorWarehouse` (lib/gocelular.ts) excluye del total todo lo
-- que está 'in_transit_andreani'. Esas 470 unidades están en estado 'available'
-- pero no suman en ningún depósito de /inventario/stock.
--
-- IMPORTANTE: el usuario de la app (inventory_readonly) no tiene UPDATE. Esto lo
-- corre el equipo de GOcelular con un rol con permisos de escritura, y sólo
-- después de decidir con el depósito cuál de los dos escenarios aplica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Diagnóstico — qué hay trabado hoy
-- ----------------------------------------------------------------------------
SELECT COALESCE(dm.name, ii.model_code) AS modelo,
       ii.model_code,
       ii.batch_id,
       ii.created_at::date                       AS alta,
       now()::date - ii.created_at::date         AS dias_en_transito,
       count(*)                                  AS unidades,
       count(ii.andreani_received_at)            AS con_received_at
FROM inventory_items ii
LEFT JOIN device_models dm ON dm.model_code = ii.model_code
WHERE ii.physical_location = 'in_transit_andreani'
GROUP BY 1, 2, 3, 4
ORDER BY 4, 1;

-- Contraste: en los mismos lotes, cuántas unidades quedaron en cada ubicación
SELECT ii.batch_id,
       COALESCE(dm.name, ii.model_code) AS modelo,
       ii.created_at::date              AS alta,
       count(*) FILTER (WHERE ii.physical_location = 'in_transit_andreani') AS en_transito,
       count(*) FILTER (WHERE ii.physical_location = 'andreani_wh')         AS en_wh,
       count(*) FILTER (WHERE ii.physical_location = 'local')               AS local
FROM inventory_items ii
LEFT JOIN device_models dm ON dm.model_code = ii.model_code
WHERE ii.batch_id IN (SELECT DISTINCT batch_id FROM inventory_items WHERE physical_location = 'in_transit_andreani')
GROUP BY 1, 2, 3
HAVING count(*) FILTER (WHERE ii.physical_location = 'in_transit_andreani') > 0
ORDER BY 3, 2;

-- ----------------------------------------------------------------------------
-- 2) Corrección — elegir UNA de las dos según el conteo físico
--
-- Antes de correr cualquiera de las dos: contar en el depósito. Si Andreani
-- tiene los equipos, va el escenario A; si nunca salieron de GOcuotas, el B.
-- Las dos acotan al tránsito viejo (< 2026-08-05, anterior al arranque del WH)
-- para no tocar los envíos en curso.
-- ----------------------------------------------------------------------------

-- Escenario A — los equipos están físicamente en Andreani y sólo falta el flip.
-- Reemplazar '2026-08-06' por la fecha real de recepción que informe el depósito.
--
-- BEGIN;
-- UPDATE inventory_items
--    SET physical_location    = 'andreani_wh',
--        andreani_received_at = TIMESTAMPTZ '2026-08-06 00:00:00-03',
--        updated_at           = now()
--  WHERE physical_location = 'in_transit_andreani'
--    AND andreani_received_at IS NULL
--    AND created_at < DATE '2026-08-05';
-- -- Verificar que impacte 470 filas (340 + 130) + 20 si se incluye el Redmi 14C.
-- COMMIT;   -- o ROLLBACK si el conteo no da

-- Escenario B — nunca se enviaron: vuelven al depósito propio.
--
-- BEGIN;
-- UPDATE inventory_items
--    SET physical_location = 'local',
--        updated_at        = now()
--  WHERE physical_location = 'in_transit_andreani'
--    AND andreani_received_at IS NULL
--    AND created_at < DATE '2026-08-05';
-- COMMIT;   -- o ROLLBACK si el conteo no da

-- ----------------------------------------------------------------------------
-- 3) Control posterior — no debería quedar tránsito de más de 10 días
-- ----------------------------------------------------------------------------
SELECT COALESCE(dm.name, ii.model_code) AS modelo,
       count(*)                          AS unidades,
       min(ii.created_at)::date          AS mas_vieja
FROM inventory_items ii
LEFT JOIN device_models dm ON dm.model_code = ii.model_code
WHERE ii.physical_location = 'in_transit_andreani'
  AND ii.created_at < now() - INTERVAL '10 days'
GROUP BY 1
ORDER BY 2 DESC;
