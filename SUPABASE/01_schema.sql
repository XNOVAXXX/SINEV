create table public.vehiculos (
  placa text primary key check (placa ~ '^[A-Z0-9]{5,7}$'),
  cedula text not null, nombre text not null, telefono text, direccion text, correo text,
  modelo int, version_euro text, nivel_euro smallint check (nivel_euro between 1 and 6),
  combustible text, estado text not null check (estado in ('en circulacion','fuera de circulacion'))
);
create index on public.vehiculos (cedula);

create table public.perfiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null, nombre text not null,
  rol text not null check (rol in ('administrador','operador'))
);

create function public.es_staff() returns boolean language sql stable security definer set search_path=public
as $$ select exists (select 1 from perfiles where id=auth.uid()) $$;
create function public.es_admin() returns boolean language sql stable security definer set search_path=public
as $$ select exists (select 1 from perfiles where id=auth.uid() and rol='administrador') $$;

alter table public.vehiculos enable row level security;
alter table public.perfiles  enable row level security;
-- Solo lectura: el personal únicamente puede ver (no hay políticas de INSERT, UPDATE ni DELETE)
create policy v_sel on public.vehiculos for select to authenticated using (es_staff());
create policy p_sel on public.perfiles  for select to authenticated using (id=auth.uid());

-- La consulta pública (consultar_vehiculo) se define en 06_privacidad.sql
create function public.total_vehiculos() returns bigint language sql stable security definer set search_path=public
as $$ select count(*) from vehiculos $$;

revoke all on public.vehiculos, public.perfiles from anon, authenticated;
-- Permisos explícitos (no depender de los que Supabase da por defecto): solo lectura
grant select on public.vehiculos to authenticated;
grant select on public.perfiles to authenticated;
grant execute on function public.total_vehiculos to anon, authenticated;
