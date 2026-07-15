-- Proformas: cotizaciones armadas por el admin con modelos y cantidades
create table if not exists proformas (
  id uuid default gen_random_uuid() primary key,
  nombre text not null default '',
  fecha timestamp with time zone default now(),
  mup numeric not null default 30,
  total_neto numeric not null default 0,
  total_iva numeric not null default 0,
  total_con_iva numeric not null default 0,
  notas text,
  created_at timestamp with time zone default now()
);

create table if not exists proforma_items (
  id uuid default gen_random_uuid() primary key,
  proforma_id uuid not null references proformas(id) on delete cascade,
  producto_id uuid not null references compras_productos(id),
  producto_nombre text not null,
  cantidad integer not null default 1,
  precio_costo numeric not null default 0,
  precio_venta_neto numeric not null default 0,
  iva numeric not null default 0,
  subtotal_con_iva numeric not null default 0
);

create index if not exists idx_proforma_items_proforma on proforma_items(proforma_id);

-- RLS
alter table proformas enable row level security;
alter table proforma_items enable row level security;

create policy "Admin full access proformas" on proformas for all using (true) with check (true);
create policy "Admin full access proforma_items" on proforma_items for all using (true) with check (true);
