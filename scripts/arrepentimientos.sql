-- Solicitudes del Botón de Arrepentimiento (mails de n8n) + cursor IMAP.
-- Correr en Supabase SQL Editor con nombre "arrepentimientos — tablas".
create table if not exists arrepentimientos (
  id uuid primary key default gen_random_uuid(),
  dni text not null,
  nombre text not null,
  email_uid bigint not null unique,
  email_fecha timestamptz not null,
  order_number text,
  gocuotas_order_id text,
  producto text,
  tracking text,
  otras_ordenes int not null default 0,
  insistencias int not null default 1,
  ultima_insistencia_at timestamptz not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','confirmada','descartada')),
  descarte_motivo text,
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists arrepentimientos_dni_idx on arrepentimientos (dni);
create index if not exists arrepentimientos_estado_idx on arrepentimientos (estado);

create table if not exists arrepentimientos_estado (
  id int primary key default 1 check (id = 1),
  ultimo_uid bigint not null,
  uidvalidity bigint not null,
  updated_at timestamptz not null default now()
);

-- Job de pg_cron (correr una vez en Supabase SQL Editor, nombre
-- "arrepentimientos — cron"). Reemplazar <CRON_SECRET> por el valor real:
-- select cron.schedule(
--   'arrepentimientos-ingesta',
--   '*/30 * * * *',
--   $$ select net.http_get(
--        url := 'https://gocelular360.vercel.app/api/cron/arrepentimientos',
--        headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
--        timeout_milliseconds := 55000
--      ) $$
-- );

-- Fix review final (5/10): el unique por email_uid solo pierde mails en
-- silencio si Gmail cambia UIDVALIDITY y re-numera solapando UIDs viejos.
-- Unique compuesto (uidvalidity, email_uid).
alter table arrepentimientos add column if not exists uidvalidity bigint not null default 0;
alter table arrepentimientos drop constraint if exists arrepentimientos_email_uid_key;
drop index if exists arrepentimientos_email_uid_key;
create unique index if not exists arrepentimientos_uidv_uid_key on arrepentimientos (uidvalidity, email_uid);

-- Estado de la orden GOcuotas (pedido de Emiliano 5/10): se guarda al crear
-- y se refresca en cada corrida del cron para las pendientes.
alter table arrepentimientos add column if not exists gocuotas_status text;
