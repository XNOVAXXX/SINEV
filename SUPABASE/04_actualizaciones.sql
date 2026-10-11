-- ═══════════════════════════════════════════════════════════════════
-- SINEV · Actualización v2
-- Ejecutar DESPUÉS de 01_schema.sql, 02_datos.sql y 03_campanas.sql.
-- Es idempotente: se puede ejecutar más de una vez sin dañar nada.
--   1) Kilometraje sintético por vehículo (para calcular emisiones)
--   2) Campañas personalizadas (filtros + mensaje propio)
--   3) Permiso para que el administrador vea la lista de usuarios internos
-- ═══════════════════════════════════════════════════════════════════

-- ───────────── 1. KILOMETRAJE ─────────────
alter table public.vehiculos add column if not exists kilometraje int;
alter table public.vehiculos drop constraint if exists vehiculos_kilometraje_check;
alter table public.vehiculos add constraint vehiculos_kilometraje_check
  check (kilometraje is null or kilometraje between 0 and 1500000);

-- Kilometraje sintético y determinista: años de uso (máx. 25) × km anuales según combustible.
-- Misma placa + mismo modelo + mismo combustible = siempre el mismo valor.
create or replace function public.km_sintetico(p_placa text, p_modelo int, p_combustible text)
returns int language sql stable as $$
  select least(450000, greatest(300, (round(
    least(greatest(extract(year from current_date)::int - coalesce(p_modelo, extract(year from current_date)::int - 5), 0.5), 25)
    * ( case p_combustible when 'Diesel' then 12000 when 'Gasolina' then 6000 when 'Hibrido' then 8000 else 6000 end
      + (abs(hashtextextended(coalesce(p_placa, ''), 11)) % 10000) / 10000.0
        * case p_combustible when 'Diesel' then 18000 when 'Gasolina' then 14000 when 'Hibrido' then 14000 else 12000 end )
    / 10) * 10)::int))
$$;

-- Los vehículos nuevos sin kilometraje reciben uno sintético (así 02_datos.sql se puede volver a ejecutar)
create or replace function public.vehiculos_km_defecto() returns trigger language plpgsql as $$
begin
  if new.kilometraje is null then
    new.kilometraje := public.km_sintetico(new.placa, new.modelo, new.combustible);
  end if;
  return new;
end $$;
drop trigger if exists vehiculos_km_defecto on public.vehiculos;
create trigger vehiculos_km_defecto before insert on public.vehiculos
  for each row execute function public.vehiculos_km_defecto();

-- Rellena solo los que no tienen valor (carga inicial; en una base ya cargada no afecta ninguna fila)
update public.vehiculos set kilometraje = public.km_sintetico(placa, modelo, combustible) where kilometraje is null;

-- La consulta pública (consultar_vehiculo) se define en 06_privacidad.sql

-- ───────────── 2. CAMPAÑAS PERSONALIZADAS ─────────────
alter table public.campanas
  add column if not exists combustibles text[],
  add column if not exists km_min int,
  add column if not exists km_max int,
  add column if not exists modelo_min int,
  add column if not exists modelo_max int,
  add column if not exists ciudad text,
  add column if not exists asunto text,
  add column if not exists mensaje text;

-- Las firmas anteriores se reemplazan por las nuevas (con filtros opcionales)
drop function if exists public.previsualizar_campana(int[], text);
drop function if exists public.ejecutar_campana(text, int[], text, text[]);

-- Interna: vehículos que recibirían la campaña (EURO 1-3, máx. 3 avisos, al menos 20 días desde el
-- aviso anterior, más los filtros elegidos).
-- La usan la vista previa y la ejecución para que ambas coincidan siempre.
create or replace function public._campana_objetivo(
  p_niveles int[], p_estado text, p_combustibles text[], p_km_min int, p_km_max int,
  p_modelo_min int, p_modelo_max int, p_ciudad text)
returns setof public.vehiculos language plpgsql stable security definer set search_path=public as $$
begin
  if coalesce(array_length(p_niveles,1),0)=0 then raise exception 'Seleccione al menos un nivel EURO'; end if;
  if p_estado not in ('todos','en circulacion','fuera de circulacion') then raise exception 'Estado de circulación no válido'; end if;
  if p_km_min is not null and p_km_max is not null and p_km_min > p_km_max then
    raise exception 'El kilometraje mínimo no puede ser mayor que el máximo'; end if;
  if p_modelo_min is not null and p_modelo_max is not null and p_modelo_min > p_modelo_max then
    raise exception 'El año de modelo inicial no puede ser mayor que el final'; end if;
  return query
    select v.* from vehiculos v
    where v.nivel_euro between 1 and 3 and v.nivel_euro = any(p_niveles)
      and coalesce(v.combustible,'') <> 'Electrico'   -- sin emisiones de escape: nunca se notifican
      and (p_estado='todos' or v.estado=p_estado)
      and (coalesce(array_length(p_combustibles,1),0)=0 or v.combustible = any(p_combustibles))
      and (p_km_min is null or v.kilometraje >= p_km_min)
      and (p_km_max is null or v.kilometraje <= p_km_max)
      and (p_modelo_min is null or v.modelo >= p_modelo_min)
      and (p_modelo_max is null or v.modelo <= p_modelo_max)
      and (coalesce(trim(p_ciudad),'')='' or position(lower(trim(p_ciudad)) in lower(v.direccion)) > 0)
      and (select count(*) from notificaciones x where x.placa=v.placa) < 3
      and not exists (select 1 from notificaciones x where x.placa=v.placa and x.fecha > now() - interval '20 days');
end $$;

create or replace function public.previsualizar_campana(
  p_niveles int[], p_estado text, p_combustibles text[] default null, p_km_min int default null, p_km_max int default null,
  p_modelo_min int default null, p_modelo_max int default null, p_ciudad text default null) returns int
language plpgsql stable security definer set search_path=public as $$
begin
  if not es_staff() then raise exception 'No autorizado'; end if;
  return (select count(*) from _campana_objetivo(p_niveles,p_estado,p_combustibles,p_km_min,p_km_max,p_modelo_min,p_modelo_max,p_ciudad))::int;
end $$;

-- Ejecutar campaña: solo administrador u operador. Solo INSERTA (campaña + avisos); nunca modifica ni borra.
-- p_mensaje admite {nombre} {placa} {nivel} {modelo} {kilometraje} {combustible} {aviso}. Vacío = texto oficial por aviso.
create or replace function public.ejecutar_campana(
  p_nombre text, p_niveles int[], p_estado text, p_canales text[],
  p_combustibles text[] default null, p_km_min int default null, p_km_max int default null,
  p_modelo_min int default null, p_modelo_max int default null, p_ciudad text default null,
  p_asunto text default null, p_mensaje text default null) returns int
language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_n int; v_user text;
begin
  if not es_staff() then raise exception 'No autorizado'; end if;
  if coalesce(length(trim(p_nombre)),0)=0 then raise exception 'La campaña necesita un nombre'; end if;
  if coalesce(array_length(p_canales,1),0)=0 or not (p_canales <@ array['correo','sms','whatsapp']) then raise exception 'Seleccione al menos un canal válido'; end if;
  if length(coalesce(p_asunto,'')) > 120 then raise exception 'El asunto no puede superar 120 caracteres'; end if;
  if length(coalesce(p_mensaje,'')) > 1000 then raise exception 'El mensaje no puede superar 1000 caracteres'; end if;

  -- Una campaña a la vez: evita que dos ejecuciones simultáneas superen los 3 avisos por vehículo
  perform pg_advisory_xact_lock(hashtext('sinev_ejecutar_campana'));

  select username into v_user from perfiles where id=auth.uid();
  -- El total se calcula antes (con el bloqueo tomado no cambia), así la campaña nunca se modifica después
  select count(*) into v_n from _campana_objetivo(p_niveles,p_estado,p_combustibles,p_km_min,p_km_max,p_modelo_min,p_modelo_max,p_ciudad);
  if v_n = 0 then raise exception 'No hay vehículos para notificar con esos filtros'; end if;
  insert into campanas(nombre,ejecutada_por,niveles,estado_filtro,canales,combustibles,km_min,km_max,modelo_min,modelo_max,ciudad,asunto,mensaje,total)
    values (trim(p_nombre), v_user, p_niveles, p_estado, p_canales,
            nullif(p_combustibles,'{}'), p_km_min, p_km_max, p_modelo_min, p_modelo_max,
            nullif(trim(p_ciudad),''), nullif(trim(p_asunto),''), nullif(trim(p_mensaje),''), v_n)
    returning id into v_id;

  insert into notificaciones(placa,campana_id,numero_aviso,tipo,motivo,correo,sms,whatsapp)
  select c.placa, v_id, c.num,
    case c.num when 1 then 'Primer Aviso' when 2 then 'Segundo Aviso' else 'Tercer Aviso' end || ' – ' ||
      coalesce(nullif(trim(p_asunto),''),
        case c.num when 1 then 'Incumplimiento Norma EURO 4' when 2 then 'Requerimiento de Revisión Técnica' else 'Inicio de Proceso Sancionatorio' end),
    replace(replace(replace(replace(replace(replace(replace(
      coalesce(nullif(trim(p_mensaje),''),
        case c.num
          when 1 then 'Vehículo registrado con norma EURO {nivel}, inferior al mínimo EURO 4. Se notifica al propietario para iniciar el proceso de regularización ambiental.'
          when 2 then 'Sin mejora registrada tras el primer aviso. Se solicita certificado de revisión técnica ambiental ante centro autorizado en un plazo de 20 días calendario.'
          else 'Sin corrección verificada tras los avisos previos. Se inicia proceso sancionatorio conforme a la normativa ambiental vigente; el vehículo deberá acreditar norma EURO 4 o superior.' end),
      '{nombre}', c.nombre), '{placa}', c.placa), '{nivel}', c.nivel_euro::text), '{modelo}', coalesce(c.modelo::text,'s/d')),
      '{kilometraje}', coalesce(c.kilometraje::text,'s/d')), '{combustible}', coalesce(c.combustible,'s/d')), '{aviso}', c.num::text),
    'correo'=any(p_canales), 'sms'=any(p_canales), 'whatsapp'=any(p_canales)
  from (
    select o.*, (select count(*)+1 from notificaciones x where x.placa=o.placa)::smallint as num
    from _campana_objetivo(p_niveles,p_estado,p_combustibles,p_km_min,p_km_max,p_modelo_min,p_modelo_max,p_ciudad) o
  ) c
  where c.num <= 3;
  return v_n;
end $$;

revoke execute on function public._campana_objetivo(int[],text,text[],int,int,int,int,text) from public, anon, authenticated;
revoke execute on function public.previsualizar_campana(int[],text,text[],int,int,int,int,text) from public, anon;
revoke execute on function public.ejecutar_campana(text,int[],text,text[],text[],int,int,int,int,text,text,text) from public, anon;
grant execute on function public.previsualizar_campana(int[],text,text[],int,int,int,int,text) to authenticated;
grant execute on function public.ejecutar_campana(text,int[],text,text[],text[],int,int,int,int,text,text,text) to authenticated;

-- ───────────── 3. USUARIOS INTERNOS ─────────────
-- El administrador puede ver la lista de perfiles (cada usuario sigue viendo el suyo con p_sel).
-- Crear usuarios NO se hace desde SQL: lo hace la función de Supabase "crear-usuario" (ver README).
drop policy if exists p_sel_admin on public.perfiles;
create policy p_sel_admin on public.perfiles for select to authenticated using (es_admin());

-- ───────────── 4. ACTUALIZAR LA CACHÉ DE LA API ─────────────
-- Hace que Supabase reconozca de inmediato las funciones y columnas nuevas
notify pgrst, 'reload schema';

-- Comprobación: debe devolver 1 fila por función (previsualizar_campana y ejecutar_campana)
select proname, pronargs as parametros from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('previsualizar_campana','ejecutar_campana');
