-- Extensiones
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type estado_dispositivo as enum ('disponible', 'asignado', 'vendido', 'devuelto');
create type estado_auditoria as enum ('borrador', 'confirmada');
create type tipo_diferencia as enum ('faltante', 'sobrante');
create type estado_diferencia as enum ('pendiente', 'cobrado', 'resuelto');

-- ============================================================
-- CONFIG (una sola fila)
-- ============================================================
create table config (
  id uuid primary key default uuid_generate_v4(),
  multiplicador numeric not null default 1.8,
  updated_at timestamptz not null default now()
);
insert into config (multiplicador) values (1.8);

-- ============================================================
-- CONSIGNATARIOS
-- ============================================================
create table consignatarios (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  owner_id text,
  store_id text,
  email text unique not null,
  telefono text,
  punto_reorden integer not null default 10,
  comision_porcentaje numeric not null default 0.10,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- MODELOS
-- ============================================================
create table modelos (
  id uuid primary key default uuid_generate_v4(),
  marca text not null,
  modelo text not null,
  precio_costo numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(marca, modelo)
);

-- ============================================================
-- DISPOSITIVOS
-- ============================================================
create table dispositivos (
  id uuid primary key default uuid_generate_v4(),
  imei text unique not null,
  modelo_id uuid not null references modelos(id),
  estado estado_dispositivo not null default 'disponible',
  consignatario_id uuid references consignatarios(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ASIGNACIONES
-- ============================================================
create table asignaciones (
  id uuid primary key default uuid_generate_v4(),
  consignatario_id uuid not null references consignatarios(id),
  fecha date not null default current_date,
  total_unidades integer not null,
  total_valor_costo numeric not null,
  total_valor_venta numeric not null,
  firmado_por text not null,
  firma_url text not null,
  documento_url text,
  created_at timestamptz not null default now()
);

create table asignacion_items (
  id uuid primary key default uuid_generate_v4(),
  asignacion_id uuid not null references asignaciones(id) on delete cascade,
  dispositivo_id uuid not null references dispositivos(id)
);

-- ============================================================
-- VENTAS
-- ============================================================
create table ventas (
  id uuid primary key default uuid_generate_v4(),
  dispositivo_id uuid not null references dispositivos(id),
  consignatario_id uuid not null references consignatarios(id),
  fecha_venta date not null,
  precio_venta numeric not null,
  comision_monto numeric not null,
  gocelular_sale_id text unique,
  synced_at timestamptz not null default now()
);

-- ============================================================
-- AUDITORIAS
-- ============================================================
create table auditorias (
  id uuid primary key default uuid_generate_v4(),
  consignatario_id uuid not null references consignatarios(id),
  realizada_por text not null,
  fecha date not null default current_date,
  estado estado_auditoria not null default 'borrador',
  firma_url text,
  documento_url text,
  observaciones text,
  created_at timestamptz not null default now()
);

create table auditoria_items (
  id uuid primary key default uuid_generate_v4(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  dispositivo_id uuid not null references dispositivos(id),
  presente boolean not null default false,
  observacion text
);

-- ============================================================
-- DIFERENCIAS
-- ============================================================
create table diferencias (
  id uuid primary key default uuid_generate_v4(),
  auditoria_id uuid not null references auditorias(id),
  dispositivo_id uuid not null references dispositivos(id),
  tipo tipo_diferencia not null,
  estado estado_diferencia not null default 'pendiente',
  monto_deuda numeric not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- FUNCIÓN: calcular diferencias al confirmar auditoría
-- ============================================================
create or replace function calcular_diferencias_auditoria(p_auditoria_id uuid)
returns void as $$
declare
  v_consignatario_id uuid;
  v_multiplicador numeric;
  v_dispositivo record;
begin
  select consignatario_id into v_consignatario_id
  from auditorias where id = p_auditoria_id;

  select multiplicador into v_multiplicador from config limit 1;

  -- Dispositivos asignados al consignatario que NO están presentes en auditoría
  -- y NO fueron vendidos
  for v_dispositivo in
    select d.id as dispositivo_id, m.precio_costo
    from dispositivos d
    join modelos m on m.id = d.modelo_id
    where d.consignatario_id = v_consignatario_id
      and d.estado = 'asignado'
      and d.id not in (
        select dispositivo_id from auditoria_items
        where auditoria_id = p_auditoria_id and presente = true
      )
  loop
    insert into diferencias (auditoria_id, dispositivo_id, tipo, estado, monto_deuda)
    values (
      p_auditoria_id,
      v_dispositivo.dispositivo_id,
      'faltante',
      'pendiente',
      v_dispositivo.precio_costo * v_multiplicador
    );
  end loop;

  -- Marcar auditoría como confirmada
  update auditorias set estado = 'confirmada' where id = p_auditoria_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RLS
-- ============================================================
alter table config enable row level security;
alter table consignatarios enable row level security;
alter table modelos enable row level security;
alter table dispositivos enable row level security;
alter table asignaciones enable row level security;
alter table asignacion_items enable row level security;
alter table ventas enable row level security;
alter table auditorias enable row level security;
alter table auditoria_items enable row level security;
alter table diferencias enable row level security;

-- Admin: acceso total (rol 'admin' en user_metadata)
create policy "admin_all" on config for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on consignatarios for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on modelos for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on dispositivos for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on asignaciones for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on asignacion_items for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on ventas for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on auditorias for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on auditoria_items for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on diferencias for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

-- Consignatario: solo sus propios registros
create policy "consignatario_select_self" on consignatarios for select
  using (user_id = auth.uid());

create policy "consignatario_select_dispositivos" on dispositivos for select
  using (
    consignatario_id in (
      select id from consignatarios where user_id = auth.uid()
    )
  );

create policy "consignatario_select_asignaciones" on asignaciones for select
  using (
    consignatario_id in (
      select id from consignatarios where user_id = auth.uid()
    )
  );

create policy "consignatario_select_asignacion_items" on asignacion_items for select
  using (
    asignacion_id in (
      select id from asignaciones where consignatario_id in (
        select id from consignatarios where user_id = auth.uid()
      )
    )
  );

create policy "consignatario_select_ventas" on ventas for select
  using (
    consignatario_id in (
      select id from consignatarios where user_id = auth.uid()
    )
  );

create policy "consignatario_select_auditorias" on auditorias for select
  using (
    consignatario_id in (
      select id from consignatarios where user_id = auth.uid()
    )
  );

create policy "consignatario_select_diferencias" on diferencias for select
  using (
    auditoria_id in (
      select id from auditorias where consignatario_id in (
        select id from consignatarios where user_id = auth.uid()
      )
    )
  );

create policy "consignatario_select_modelos" on modelos for select
  using (true);

create policy "consignatario_select_config" on config for select
  using (true);
