-- Agregar estado a proformas (borrador/confirmada)
alter table proformas add column if not exists estado text not null default 'borrador';

-- Agregar cliente_nombre a proformas para identificar al comprador mayorista
alter table proformas add column if not exists cliente_nombre text not null default '';

-- Permitir asignaciones vinculadas a proformas (venta mayorista)
alter table asignaciones add column if not exists proforma_id uuid references proformas(id);
alter table asignaciones alter column consignatario_id drop not null;
