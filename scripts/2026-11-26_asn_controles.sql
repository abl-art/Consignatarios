-- Control de ingreso de ASN por link publico (provisorio hasta que Andreani
-- tenga API/webhook de ingreso). Un control por ASN; el operario del deposito
-- escanea contra el link y el resultado queda aca.
create table if not exists asn_controles (
  id bigint generated always as identity primary key,
  asn_id uuid not null,
  asn_transaccion text not null,
  token text not null unique,
  estado text not null default 'pendiente', -- pendiente | finalizado
  leidos jsonb not null default '[]',
  sobrantes jsonb not null default '[]',
  nota text,
  finalizado_at timestamptz,
  novedad_enviada_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists asn_controles_asn_id on asn_controles (asn_id);
alter table asn_controles disable row level security;

-- Rediseño 26/11 (feedback Emiliano): link UNICO (token en flujo_config key
-- 'share_asn_token'); el token por control ya no se usa.
alter table asn_controles alter column token drop not null;
