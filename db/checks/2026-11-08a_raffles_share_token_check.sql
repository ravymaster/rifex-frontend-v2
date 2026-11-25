-- db/checks/2026-11-08a_raffles_share_token_check.sql
-- Verificación de solo lectura de db/migrations/2026-11-08a_raffles_share_token.sql.
-- Esperado: has_column, not_null, unique_index, format_constraint,
-- immutable_trigger y has_default en true; rows_without_token,
-- bad_format y duplicates en 0; anon_can_read y auth_can_read en false.
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'raffles' and column_name = 'share_token')        as has_column,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'raffles' and column_name = 'share_token'
             and is_nullable = 'NO')                                                                      as not_null,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'raffles' and column_name = 'share_token'
             and column_default like '%new_raffle_share_token%')                                          as has_default,
  exists (select 1 from pg_indexes
           where schemaname = 'public' and tablename = 'raffles' and indexname = 'raffles_share_token_key'
             and indexdef ilike '%unique%')                                                               as unique_index,
  exists (select 1 from pg_constraint
           where conrelid = 'public.raffles'::regclass and conname = 'raffles_share_token_format')         as format_constraint,
  exists (select 1 from pg_trigger
           where tgrelid = 'public.raffles'::regclass and tgname = 'raffles_share_token_immutable')         as immutable_trigger,
  (select count(*) from public.raffles where share_token is null)                                          as rows_without_token,
  (select count(*) from public.raffles where share_token !~ '^[A-Za-z0-9_-]{22}$')                         as bad_format,
  (select count(*) - count(distinct share_token) from public.raffles)                                     as duplicates,
  has_column_privilege('anon', 'public.raffles', 'share_token', 'select')                                  as anon_can_read,
  has_column_privilege('authenticated', 'public.raffles', 'share_token', 'select')                         as auth_can_read;
