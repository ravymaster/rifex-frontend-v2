-- db/checks/2026-11-24a_warp_pilot_requests_check.sql
-- Verificación de solo lectura de la migración 2026-11-24a. No devuelve filas
-- de solicitudes ni datos personales: solo estructura, permisos y conteos.
select json_build_object(
  'tablas', (select json_agg(c.relname order by c.relname) from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname in ('warp_pilot_requests', 'warp_pilot_request_history')),
  'rls', (select json_object_agg(c.relname, c.relrowsecurity) from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname in ('warp_pilot_requests', 'warp_pilot_request_history')),
  'politicas', (select json_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ',') order by policyname)
                from pg_policies where schemaname = 'public' and tablename = 'warp_pilot_requests'),
  'permisos_tabla_anon_authenticated', (select coalesce(json_agg(grantee || ':' || table_name || ':' || privilege_type order by 1), '[]'::json)
                from information_schema.role_table_grants
                where table_schema = 'public' and table_name in ('warp_pilot_requests', 'warp_pilot_request_history')
                  and grantee in ('anon', 'authenticated', 'PUBLIC')),
  'columnas_authenticated', (select json_object_agg(privilege_type, cols) from (
                select privilege_type, json_agg(column_name order by column_name) cols
                from information_schema.column_privileges
                where table_schema = 'public' and table_name = 'warp_pilot_requests' and grantee = 'authenticated'
                group by privilege_type) s),
  'internal_notes_legible_por_authenticated', exists (
                select 1 from information_schema.column_privileges
                where table_schema = 'public' and table_name = 'warp_pilot_requests'
                  and grantee = 'authenticated' and column_name = 'internal_notes' and privilege_type = 'SELECT'),
  'indices', (select json_agg(indexname order by indexname) from pg_indexes
              where schemaname = 'public' and tablename = 'warp_pilot_requests'),
  'solicitudes', (select count(*) from public.warp_pilot_requests),
  'historial', (select count(*) from public.warp_pilot_request_history)
) as warp_pilot_requests_check;
