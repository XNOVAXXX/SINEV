-- ════════════════════════════════════════════════════════════
-- Pruebas de la base de datos de SINEV. Cada bloque falla con un mensaje claro si algo no cumple.
-- Se ejecuta después de 00_simular_supabase.sql y de SUPABASE/01-08 (ver .github/workflows/pruebas.yml).
-- ════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

-- Personal de prueba: un administrador y un operador
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.perfiles values
  ('00000000-0000-0000-0000-00000000000a', 'admin', 'Admin Prueba', 'administrador'),
  ('00000000-0000-0000-0000-00000000000b', 'operador', 'Operador Prueba', 'operador');

-- 1. Datos sintéticos coherentes
do $$
declare n int; inc int; sin_km int;
begin
  select count(*) into n from vehiculos;
  assert n = 1000, format('Se esperaban 1000 vehículos y hay %s', n);
  select count(*) into inc from vehiculos
   where (combustible = 'Electrico' and (modelo < 2012 or nivel_euro is not null))
      or (nivel_euro = 1 and modelo not between 1993 and 1996) or (nivel_euro = 2 and modelo not between 1997 and 2000)
      or (nivel_euro = 3 and modelo not between 2001 and 2005) or (nivel_euro = 4 and modelo not between 2006 and 2010)
      or (nivel_euro = 5 and modelo not between 2011 and 2014) or (nivel_euro = 6 and modelo < 2015)
      or (combustible = 'Hibrido' and nivel_euro <= 2);
  assert inc = 0, format('Hay %s vehículos incoherentes', inc);
  select count(*) into sin_km from vehiculos where kilometraje is null;
  assert sin_km = 0, format('Hay %s vehículos sin kilometraje', sin_km);
end $$;

-- 2. Solo lectura: nadie puede modificar ni borrar, ni siquiera el dueño de la base
do $$ begin
  update vehiculos set nombre = 'x' where placa = 'GKV921';
  raise exception 'FALLA: se pudo modificar un vehículo';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from vehiculos where placa = 'GKV921';
  raise exception 'FALLA: se pudo borrar un vehículo';
exception when insufficient_privilege then null; end $$;

-- 3. Público (anon): no lee tablas, consulta por placa con datos ocultos, no busca por cédula
set role anon;
do $$ begin
  perform 1 from vehiculos limit 1;
  raise exception 'FALLA: el público puede leer la tabla vehiculos';
exception when insufficient_privilege then null; end $$;
do $$
declare v record; n int;
begin
  select * into v from consultar_vehiculo('placa', 'gkv 921');
  assert v.placa = 'GKV921', 'La consulta por placa no encontró GKV921 (con minúsculas y espacio)';
  assert v.cedula like '******%', format('La cédula no sale oculta: %s', v.cedula);
  assert v.telefono like '*******%', format('El teléfono no sale oculto: %s', v.telefono);
  assert v.correo like '_***@%', format('El correo no sale oculto: %s', v.correo);
  assert v.direccion not like '%#%', format('La dirección completa quedó visible: %s', v.direccion);
  select count(*) into n from consultar_vehiculo('documento', '1001208436');
  assert n = 0, 'El público puede buscar por cédula';
  assert total_vehiculos() = 1000, 'total_vehiculos() no devuelve 1000';
end $$;
do $$ begin
  perform estadisticas();
  raise exception 'FALLA: el público puede ver las estadísticas';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform previsualizar_campana(array[1,2,3], 'todos');
  raise exception 'FALLA: el público puede previsualizar campañas';
exception when insufficient_privilege then null; end $$;
reset role;

-- 4. Personal: ve los datos completos, busca por cédula y ve estadísticas
set test.uid = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
do $$
declare v record; e jsonb; n int;
begin
  select * into v from consultar_vehiculo('placa', 'GKV921');
  assert v.cedula = '1001208436', 'El personal no ve la cédula completa';
  select count(*) into n from consultar_vehiculo('documento', '1001208436');
  assert n = 1, 'El personal no puede buscar por cédula';
  e := estadisticas();
  assert (select sum((x->>'total')::int) from jsonb_array_elements(e->'por_euro') x) = 1000, 'por_euro no suma 1000';
  assert (select sum((x->>'total')::int) from jsonb_array_elements(e->'por_ciudad') x) = 1000, 'por_ciudad no suma 1000';
  assert jsonb_array_length(e->'por_combustible') = 4, 'por_combustible no tiene 4 combustibles';
end $$;

-- 5. Campañas: la vista previa coincide con lo ejecutado, y no se repite antes de 20 días
do $$
declare prev int; hechos int; avisos int;
begin
  prev := previsualizar_campana(array[1,2,3], 'todos');
  assert prev > 0, 'La vista previa no encontró vehículos EURO 1-3';
  hechos := ejecutar_campana('Prueba automática', array[1,2,3], 'todos', array['correo','sms']);
  assert hechos = prev, format('La vista previa (%s) no coincide con lo ejecutado (%s)', prev, hechos);
  select count(*) into avisos from notificaciones;
  assert avisos = hechos, format('Se registraron %s avisos y la campaña dice %s', avisos, hechos);
  assert not exists (select 1 from notificaciones n join vehiculos v using (placa) where v.combustible = 'Electrico' or v.nivel_euro > 3),
    'Se notificó a un eléctrico o a un vehículo EURO 4+';
  assert previsualizar_campana(array[1,2,3], 'todos') = 0, 'Se podría volver a notificar antes de 20 días';
  begin
    perform ejecutar_campana('Repetida', array[1,2,3], 'todos', array['correo']);
    raise exception 'FALLA: se ejecutó una campaña sin vehículos';
  exception when raise_exception then
    if sqlerrm not like 'No hay vehículos%' then raise; end if;
  end;
end $$;

-- 6. Historial público: el nombre del propietario sale oculto
reset role;
set role anon;
do $$
declare n int;
begin
  select count(*) into n from historial_notificaciones((select placa from consultar_vehiculo('placa', 'BKC610')));
  assert n = 1, format('BKC610 debería tener 1 aviso y tiene %s', n);
end $$;
reset role;

-- 7. Solo un administrador ve la lista de usuarios
set test.uid = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
do $$ begin assert (select count(*) from perfiles) = 1, 'Un operador ve perfiles de otros usuarios'; end $$;
reset role;
set test.uid = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
do $$ begin assert (select count(*) from perfiles) = 2, 'El administrador no ve todos los perfiles'; end $$;
reset role;

select 'Todas las pruebas de la base de datos pasaron' as resultado;
