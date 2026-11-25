-- Devengamiento anual personalizado (decision de Emiliano 25/11): cliff y
-- periodo pasan a ANIOS y el esquema es una tabla editable de % por anio
-- (jsonb [{"anio":1,"pct":10},...], suma 100). Tablas vacias: alter directo.
alter table fc_grupogo_stock_options
  drop column if exists cliff_meses,
  drop column if exists periodo_meses,
  drop column if exists devengamiento,
  add column if not exists cliff_anios int not null default 1,
  add column if not exists periodo_anios int not null default 4,
  add column if not exists esquema jsonb not null default '[]';
