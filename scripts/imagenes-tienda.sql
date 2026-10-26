-- Bucket público para las imágenes de producto procesadas para la tienda GOcelular
-- (página /canales/tienda/imagenes). Lectura pública vía /object/public/;
-- escrituras solo con service role (la API route), sin policies adicionales.
insert into storage.buckets (id, name, public)
values ('imagenes-tienda', 'imagenes-tienda', true)
on conflict (id) do nothing;
