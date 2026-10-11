-- ════════════════════════════════════════════════════════════
-- SINEV · Estadísticas para las gráficas del inicio (solo administrador u operador)
-- Devuelve en una sola llamada los totales por norma EURO, combustible, ciudad y estado.
-- Solo LEE: no modifica nada. Ejecutar después de 01-07; se puede repetir sin problema.
-- ════════════════════════════════════════════════════════════
create or replace function public.estadisticas() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not es_staff() then raise exception 'No autorizado'; end if;
  return jsonb_build_object(
    -- 'electrico' = la norma EURO no aplica; 'sin_dato' = vehículo de combustión sin norma registrada
    'por_euro', (select jsonb_agg(jsonb_build_object('clave', clave, 'total', n) order by orden) from (
        select case when combustible = 'Electrico' then 'electrico' when nivel_euro is null then 'sin_dato' else nivel_euro::text end as clave,
               case when combustible = 'Electrico' then 8 when nivel_euro is null then 7 else nivel_euro end as orden,
               count(*) as n
        from vehiculos group by 1, 2) x),
    'por_combustible', (select jsonb_agg(jsonb_build_object('clave', combustible, 'total', n) order by n desc)
        from (select combustible, count(*) as n from vehiculos group by 1) x),
    'por_ciudad', (select jsonb_agg(jsonb_build_object('clave', ciudad, 'total', n) order by n desc, ciudad)
        from (select coalesce(_solo_ciudad(direccion), 'Sin dato') as ciudad, count(*) as n from vehiculos group by 1) x),
    'por_estado', (select jsonb_agg(jsonb_build_object('clave', estado, 'total', n) order by estado)
        from (select estado, count(*) as n from vehiculos group by 1) x)
  );
end $$;

revoke execute on function public.estadisticas() from public, anon;
grant execute on function public.estadisticas() to authenticated;

notify pgrst, 'reload schema';
