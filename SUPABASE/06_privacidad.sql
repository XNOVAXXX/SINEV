-- ════════════════════════════════════════════════════════════
-- SINEV · Privacidad en la consulta pública
-- Sin sesión se ven los datos del vehículo, pero los del propietario salen parcialmente
-- ocultos (nombre, cédula, teléfono, correo; de la dirección solo la ciudad).
-- El personal (administrador u operador) los ve completos.
-- La búsqueda por cédula es solo para el personal: así nadie puede averiguar sin sesión
-- qué vehículos tiene una persona a partir de su número de documento.
-- Ejecutar después de 01-05; se puede repetir sin problema.
-- ════════════════════════════════════════════════════════════

-- Ayudantes para ocultar datos
create or replace function public._ocultar(t text, visibles int) returns text language sql immutable as $$
  select case when t is null then null else repeat('*', greatest(length(t) - visibles, 0)) || right(t, visibles) end $$;

-- "Maria Fernanda Lopez" → "Maria F. L."
create or replace function public._ocultar_nombre(t text) returns text language sql immutable as $$
  select case when t is null then null else
    split_part(trim(t), ' ', 1) || coalesce(' ' || (
      select string_agg(left(w, 1) || '.', ' ' order by i)
      from unnest((regexp_split_to_array(trim(t), '\s+'))[2:]) with ordinality as p(w, i)), '')
  end $$;

-- "julian.perez663@gmail.com" → "j***@gmail.com"
create or replace function public._ocultar_correo(t text) returns text language sql immutable as $$
  select case when t is null then null else regexp_replace(t, '^(.)[^@]*(@.*)$', '\1***\2') end $$;

-- "Cra 46 # 71-18, Cartagena" → "Cartagena"
create or replace function public._solo_ciudad(t text) returns text language sql immutable as $$
  select case when position(',' in coalesce(t, '')) > 0 then trim(regexp_replace(t, '^.*,', '')) end $$;

-- Consulta: por placa (1 vehículo, cualquiera) o por cédula (todos los vehículos de esa persona, máx. 20;
-- solo el personal con sesión iniciada).
-- Mismas columnas de siempre, para que la página no cambie.
drop function if exists public.consultar_vehiculo(text, text);
create function public.consultar_vehiculo(p_tipo text, p_valor text)
returns table (placa text, cedula text, nombre text, telefono text, direccion text, correo text,
               modelo int, version_euro text, nivel_euro smallint, combustible text, estado text, kilometraje int)
language sql stable security definer set search_path=public as $$
  select v.placa,
    case when es_staff() then v.cedula    else _ocultar(v.cedula, 4)     end,
    case when es_staff() then v.nombre    else _ocultar_nombre(v.nombre) end,
    case when es_staff() then v.telefono  else _ocultar(v.telefono, 3)   end,
    case when es_staff() then v.direccion else _solo_ciudad(v.direccion) end,
    case when es_staff() then v.correo    else _ocultar_correo(v.correo) end,
    v.modelo, v.version_euro, v.nivel_euro, v.combustible, v.estado, v.kilometraje
  from vehiculos v
  where (p_tipo = 'placa'     and v.placa  = upper(regexp_replace(coalesce(p_valor, ''), '\s', '', 'g')))
     or (p_tipo = 'documento' and es_staff() and v.cedula = regexp_replace(coalesce(p_valor, ''), '\s', '', 'g'))
  order by v.placa
  limit 20 $$;

-- Historial de avisos: sin sesión, el nombre del propietario que aparezca en el mensaje sale oculto
create or replace function public.historial_notificaciones(p_placa text) returns setof public.notificaciones
language sql stable security definer set search_path=public as $$
  select n.id, n.placa, n.campana_id, n.numero_aviso,
    case when es_staff() then n.tipo   else replace(n.tipo,   v.nombre, _ocultar_nombre(v.nombre)) end,
    case when es_staff() then n.motivo else replace(n.motivo, v.nombre, _ocultar_nombre(v.nombre)) end,
    n.correo, n.sms, n.whatsapp, n.fecha
  from notificaciones n join vehiculos v on v.placa = n.placa
  where n.placa = upper(regexp_replace(coalesce(p_placa, ''), '\s', '', 'g'))
  order by n.numero_aviso, n.fecha $$;

grant execute on function public.consultar_vehiculo(text, text), public.historial_notificaciones(text) to anon, authenticated;

notify pgrst, 'reload schema';
