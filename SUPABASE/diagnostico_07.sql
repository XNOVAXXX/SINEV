-- SINEV · Diagnóstico: por qué 07_corregir_datos.sql no guarda los cambios (solo lee, no modifica nada)
select jsonb_pretty(jsonb_build_object(
  'usuario', current_user,
  'puede_saltar_rls', (select rolbypassrls from pg_roles where rolname = current_user),
  'dueno_tabla', (select tableowner from pg_tables where schemaname = 'public' and tablename = 'vehiculos'),
  'rls_forzado', (select relforcerowsecurity from pg_class where oid = 'public.vehiculos'::regclass),
  'triggers', (select jsonb_agg(tgname || ' [' || tgenabled::text || '] ' || pg_get_triggerdef(t.oid))
               from pg_trigger t where tgrelid = 'public.vehiculos'::regclass and not tgisinternal),
  'politicas', (select jsonb_agg(policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') || ' ' || coalesce(qual, ''))
                from pg_policies where schemaname = 'public' and tablename = 'vehiculos'),
  'reglas', (select jsonb_agg(rulename) from pg_rules where schemaname = 'public' and tablename = 'vehiculos'),
  'ejemplos_incoherentes', (select jsonb_agg(x) from (
      select placa, modelo, nivel_euro, combustible, version_euro from public.vehiculos
      where combustible = 'Electrico' and modelo < 2012
         or (nivel_euro = 1 and modelo not between 1993 and 1996) or (nivel_euro = 2 and modelo not between 1997 and 2000)
         or (nivel_euro = 3 and modelo not between 2001 and 2005) or (nivel_euro = 4 and modelo not between 2006 and 2010)
         or (nivel_euro = 5 and modelo not between 2011 and 2014) or (nivel_euro = 6 and modelo < 2015)
      order by placa limit 6) x)
)) as diagnostico;
