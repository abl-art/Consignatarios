-- Nombre: Bonos - columna precio_bono_publicado_at
-- Marca cuándo se publicó en la tienda el precio CON bono de la campaña
-- (al guardarla ya vigente, o por el cron cuando el bono arranca).
-- El cron de publicación reintenta cada 10 min mientras esté en NULL.
alter table lista_precios_bonos
  add column if not exists precio_bono_publicado_at timestamptz;
