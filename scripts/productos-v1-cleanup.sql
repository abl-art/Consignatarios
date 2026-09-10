-- productos-v1-cleanup: borrar productos financieros del simulador v1
-- (Emiliano, 10 sep 2026: no los va a usar; el simulador v2 usa schema_version 2)
DELETE FROM productos_financieros
WHERE (parametros->>'schema_version') IS DISTINCT FROM '2';
