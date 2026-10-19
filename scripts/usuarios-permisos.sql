-- Usuarios Permisos — tabla y RLS

create table if not exists public.usuarios_permisos (
  user_id uuid primary key references auth.users (id),
  email text not null,
  super_admin boolean default false,
  activo boolean default true,
  permisos jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.usuarios_permisos enable row level security;

drop policy if exists "usuarios_permisos_select_own" on public.usuarios_permisos;

create policy "usuarios_permisos_select_own"
  on public.usuarios_permisos
  for select
  using (auth.uid() = user_id);
