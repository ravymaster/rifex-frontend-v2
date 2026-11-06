-- db/checks/2026-11-06_raffles_public_column_grants_check.sql
-- Verificación de solo lectura de db/migrations/2026-11-06_raffles_public_column_grants.sql.
-- Esperado después de aplicar: todas las columnas *_public en true y todas
-- las *_private en false.
select
  has_column_privilege('anon', 'public.raffles', 'title', 'select')                 as anon_title_public,
  has_column_privilege('anon', 'public.raffles', 'prize_photos', 'select')          as anon_photos_public,
  has_column_privilege('authenticated', 'public.raffles', 'slug', 'select')         as auth_slug_public,
  has_column_privilege('anon', 'public.rifas', 'titulo', 'select')                  as anon_rifas_titulo_public,
  has_column_privilege('anon', 'public.raffles', 'creator_email', 'select')         as anon_creator_email_private,
  has_column_privilege('anon', 'public.raffles', 'creator_id', 'select')            as anon_creator_id_private,
  has_column_privilege('authenticated', 'public.raffles', 'creator_email', 'select') as auth_creator_email_private,
  has_column_privilege('anon', 'public.raffles', 'payout_method', 'select')         as anon_payout_private,
  has_column_privilege('anon', 'public.rifas', 'creador_id', 'select')              as anon_rifas_creador_private,
  has_table_privilege('anon', 'public.raffle_results', 'select')                    as anon_raffle_results_private,
  has_table_privilege('authenticated', 'public.raffle_results', 'select')           as auth_raffle_results_private,
  has_column_privilege('service_role', 'public.raffles', 'creator_email', 'select') as service_role_keeps_access;
