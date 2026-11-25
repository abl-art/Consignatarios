-- Stock options de Grupo GO: grants por persona, valuacion de la empresa
-- (insert-only, vale la ultima) y contrato firmado en base64 (simple y
-- suficiente para PDFs de pocas MB; migrable a Storage si crece).

create table if not exists fc_grupogo_stock_options (
  id bigint generated always as identity primary key,
  nombre text not null,
  fecha_otorgamiento date not null,
  sueldo_mensual_usd numeric not null,
  multiplo numeric not null,
  valuacion_ingreso_usd numeric not null,
  cliff_meses int not null default 12,
  periodo_meses int not null default 48,
  devengamiento text not null default 'mensual', -- mensual | trimestral | anual
  created_at timestamptz default now()
);

create table if not exists fc_grupogo_valuacion_empresa (
  id bigint generated always as identity primary key,
  fecha date not null,
  valuacion_usd numeric not null,
  nota text,
  created_at timestamptz default now()
);

create table if not exists fc_grupogo_so_contratos (
  option_id bigint primary key references fc_grupogo_stock_options(id) on delete cascade,
  filename text not null,
  mime text not null default 'application/pdf',
  data_base64 text not null,
  updated_at timestamptz default now()
);

alter table fc_grupogo_stock_options disable row level security;
alter table fc_grupogo_valuacion_empresa disable row level security;
alter table fc_grupogo_so_contratos disable row level security;
