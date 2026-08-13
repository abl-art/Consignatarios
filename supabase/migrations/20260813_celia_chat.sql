-- Celia: historial de conversaciones del asistente AI
create table if not exists celia_conversaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Nueva conversación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists celia_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references celia_conversaciones(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- content guarda los bloques completos del SDK (text/tool_use/tool_result)
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_celia_mensajes_conv on celia_mensajes(conversacion_id, created_at);

-- Sin politicas RLS permisivas: solo se accede con service role desde el server
alter table celia_conversaciones enable row level security;
alter table celia_mensajes enable row level security;
