-- Backlog Operaciones (/notas, pestaña nueva): TODOs que Emiliano le carga a
-- Yamila con prioridad. Al crear se le manda mail; al marcarse realizada se
-- le carga un ToDo a Emiliano (app_todos) el día de la completación.
create table if not exists backlog_operaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text,
  prioridad text not null check (prioridad in ('urgente', 'durante_dia', 'puede_esperar')),
  creado_at timestamptz not null default now(),
  realizado_at timestamptz,
  mail_enviado_at timestamptz
);
