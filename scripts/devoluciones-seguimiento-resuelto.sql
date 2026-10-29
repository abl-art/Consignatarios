-- Cierre manual de devoluciones (pestaña Devoluciones de /compras/envios).
-- Agrega resuelto_at a devoluciones_seguimiento: ninguna devolución se
-- archiva sola por su estado de Andreani — Yami la marca con el botón
-- Resolver. NULL = pendiente de gestión. Mismo patrón que
-- rescates_seguimiento.resuelto_at.
ALTER TABLE devoluciones_seguimiento ADD COLUMN IF NOT EXISTS resuelto_at timestamptz;
