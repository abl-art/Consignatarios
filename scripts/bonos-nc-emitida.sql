-- Nombre: Bonos - columna nc_emitida_at
-- Checkbox "Emitida" de la pestaña Notas de crédito: la marca ya emitió la NC
-- de esta campaña (no hay que reclamarla). Se marca/desmarca por grupo
-- proveedor+vigencia desde la UI.
alter table lista_precios_bonos
  add column if not exists nc_emitida_at timestamptz;
