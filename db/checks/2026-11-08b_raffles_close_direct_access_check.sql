-- db/checks/2026-11-08b_raffles_close_direct_access_check.sql
-- Verificación de solo lectura de db/migrations/2026-11-08b_raffles_close_direct_access.sql.
-- Esperado después de aplicar: client_table_privileges y
-- client_column_privileges en 0; service_role_* en true.
-- legacy_* es informativo (filas en las tablas heredadas, que ya no se
-- leen desde el navegador).
with t(name) as (
  values ('raffles'), ('tickets'), ('raffle_messages'), ('raffle_results'),
         ('rifas'), ('rifa_tickets'), ('raffles_compat'), ('tickets_compat')
), rel as (
  select c.oid, c.relname, c.relacl from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join t on t.name = c.relname
  where n.nspname = 'public'
)
select
  (select count(*) from rel, aclexplode(rel.relacl) a
    where a.grantee in ('anon'::regrole, 'authenticated'::regrole))                    as client_table_privileges,
  (select count(*) from rel join pg_attribute att on att.attrelid = rel.oid, aclexplode(att.attacl) a
    where att.attnum > 0 and a.grantee in ('anon'::regrole, 'authenticated'::regrole))  as client_column_privileges,
  has_table_privilege('service_role', 'public.raffles', 'select')                         as service_role_raffles,
  has_table_privilege('service_role', 'public.tickets', 'select,insert,update')           as service_role_tickets,
  has_table_privilege('service_role', 'public.raffle_messages', 'select,insert')          as service_role_messages,
  has_table_privilege('service_role', 'public.raffle_results', 'select,insert')           as service_role_results,
  (select count(*) from public.rifas)                                                     as legacy_rifas_rows,
  (select count(*) from public.rifa_tickets)                                              as legacy_rifa_tickets_rows;
