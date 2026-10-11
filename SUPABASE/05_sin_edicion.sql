-- ════════════════════════════════════════════════════════════
-- SINEV · Solo lectura
-- Nadie (público, operador ni administrador) puede modificar ni eliminar información:
-- vehículos, campañas, avisos ni usuarios. Las campañas solo AGREGAN registros nuevos
-- y el administrador solo puede CREAR usuarios (función crear-usuario).
-- Ejecutar después de 01-04; se puede repetir sin problema.
-- ════════════════════════════════════════════════════════════

-- 1) Permisos: la API solo permite leer (las campañas insertan a través de ejecutar_campana)
drop policy if exists v_upd on public.vehiculos;
drop policy if exists v_ins on public.vehiculos;
drop policy if exists v_del on public.vehiculos;
revoke insert, update, delete, truncate on public.vehiculos, public.campanas, public.notificaciones, public.perfiles
  from public, anon, authenticated;

-- Público: se elimina la función que cambiaba teléfono/correo verificando la cédula
drop function if exists public.actualizar_contacto(text, text, text, text);

-- 2) Candado en la propia base de datos: bloquea UPDATE, DELETE y TRUNCATE para TODOS,
--    incluso desde funciones internas, la clave service_role o el panel de Supabase.
create or replace function public.sinev_solo_lectura() returns trigger language plpgsql as $$
begin
  raise exception 'SINEV es de solo lectura: no se permite % sobre %', tg_op, tg_table_name
    using errcode = '42501';
end $$;
revoke execute on function public.sinev_solo_lectura() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['vehiculos','campanas','notificaciones','perfiles'] loop
    execute format('drop trigger if exists solo_lectura on public.%I', t);
    execute format('create trigger solo_lectura before update or delete on public.%I
                    for each row execute function public.sinev_solo_lectura()', t);
    execute format('drop trigger if exists solo_lectura_truncate on public.%I', t);
    execute format('create trigger solo_lectura_truncate before truncate on public.%I
                    for each statement execute function public.sinev_solo_lectura()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
