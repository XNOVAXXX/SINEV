-- Ejecutar DESPUÉS de 01_schema.sql y 02_datos.sql
create table public.campanas (
  id bigserial primary key,
  nombre text not null,
  ejecutada_por text,
  creada_en timestamptz not null default now(),
  niveles int[] not null,
  estado_filtro text not null default 'todos',
  canales text[] not null,
  total int not null default 0
);
create table public.notificaciones (
  id bigserial primary key,
  placa text not null references public.vehiculos(placa) on delete cascade on update cascade,
  campana_id bigint not null references public.campanas(id) on delete cascade,
  numero_aviso smallint not null check (numero_aviso between 1 and 3),
  tipo text not null, motivo text not null,
  correo boolean not null default false, sms boolean not null default false, whatsapp boolean not null default false,
  fecha timestamptz not null default now()
);
create index on public.notificaciones (placa);

alter table public.campanas enable row level security;
alter table public.notificaciones enable row level security;
create policy c_sel on public.campanas for select to authenticated using (es_staff());
create policy n_sel on public.notificaciones for select to authenticated using (es_staff());
revoke all on public.campanas, public.notificaciones from anon;
grant select on public.campanas, public.notificaciones to authenticated;

-- Vehículos que recibirían la campaña (EURO 1-3, máx. 3 avisos por vehículo)
create function public.previsualizar_campana(p_niveles int[], p_estado text) returns int
language plpgsql stable security definer set search_path=public as $$
declare n int;
begin
  if not es_staff() then raise exception 'No autorizado'; end if;
  select count(*) into n from vehiculos v
  where v.nivel_euro between 1 and 3 and v.nivel_euro = any(p_niveles)
    and (p_estado='todos' or v.estado=p_estado)
    and (select count(*) from notificaciones x where x.placa=v.placa) < 3;
  return n;
end $$;

-- Ejecutar campaña: solo administrador u operador
create function public.ejecutar_campana(p_nombre text, p_niveles int[], p_estado text, p_canales text[]) returns int
language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_n int; v_user text;
begin
  if not es_staff() then raise exception 'No autorizado'; end if;
  if coalesce(length(trim(p_nombre)),0)=0 then raise exception 'La campaña necesita un nombre'; end if;
  if coalesce(array_length(p_canales,1),0)=0 or not (p_canales <@ array['correo','sms','whatsapp']) then raise exception 'Seleccione al menos un canal válido'; end if;
  if coalesce(array_length(p_niveles,1),0)=0 then raise exception 'Seleccione al menos un nivel EURO'; end if;
  select username into v_user from perfiles where id=auth.uid();
  insert into campanas(nombre,ejecutada_por,niveles,estado_filtro,canales)
    values (trim(p_nombre), v_user, p_niveles, p_estado, p_canales) returning id into v_id;
  insert into notificaciones(placa,campana_id,numero_aviso,tipo,motivo,correo,sms,whatsapp)
  select v.placa, v_id, c.num,
    case c.num when 1 then 'Primer Aviso – Incumplimiento Norma EURO 4'
               when 2 then 'Segundo Aviso – Requerimiento de Revisión Técnica'
               else 'Tercer Aviso – Inicio de Proceso Sancionatorio' end,
    case c.num when 1 then 'Vehículo registrado con norma EURO '||v.nivel_euro||', inferior al mínimo EURO 4. Se notifica al propietario para iniciar el proceso de regularización ambiental.'
               when 2 then 'Sin mejora registrada tras el primer aviso. Se solicita certificado de revisión técnica ambiental ante centro autorizado en un plazo de 20 días calendario.'
               else 'Sin corrección verificada tras los avisos previos. Se inicia proceso sancionatorio conforme a la normativa ambiental vigente; el vehículo deberá acreditar norma EURO 4 o superior.' end,
    'correo'=any(p_canales), 'sms'=any(p_canales), 'whatsapp'=any(p_canales)
  from vehiculos v
  join lateral (select (count(*)+1)::smallint as num from notificaciones x where x.placa=v.placa) c on true
  where v.nivel_euro between 1 and 3 and v.nivel_euro = any(p_niveles)
    and (p_estado='todos' or v.estado=p_estado) and c.num <= 3;
  get diagnostics v_n = row_count;
  update campanas set total=v_n where id=v_id;
  return v_n;
end $$;

-- Historial por placa (lo usa la pestaña Consultas, también sin sesión)
create function public.historial_notificaciones(p_placa text) returns setof public.notificaciones
language sql stable security definer set search_path=public as $$
  select * from notificaciones where placa=upper(p_placa) order by numero_aviso, fecha $$;

revoke execute on function public.previsualizar_campana, public.ejecutar_campana from public, anon;
grant execute on function public.previsualizar_campana, public.ejecutar_campana to authenticated;
grant execute on function public.historial_notificaciones to anon, authenticated;
