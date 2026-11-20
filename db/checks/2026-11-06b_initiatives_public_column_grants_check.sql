-- db/checks/2026-11-06b_initiatives_public_column_grants_check.sql
-- Verificación de solo lectura de db/migrations/2026-11-06b_initiatives_public_column_grants.sql.
-- Esperado: todas las columnas *_public en true y todas las *_private en false.
select
  has_column_privilege('anon', 'public.events', 'slug', 'select') as events_slug_public,
  has_column_privilege('anon', 'public.events', 'organizer_id', 'select') as events_organizer_id_private,
  has_column_privilege('authenticated', 'public.events', 'organizer_id', 'select') as events_auth_organizer_id_private,
  has_column_privilege('service_role', 'public.events', 'organizer_id', 'select') as events_service_role_keeps_access,
  has_column_privilege('anon', 'public.event_ticket_types', 'name', 'select') as event_ticket_types_name_public,
  has_column_privilege('anon', 'public.event_ticket_types', 'event_id', 'select') as event_ticket_types_event_id_private,
  has_column_privilege('authenticated', 'public.event_ticket_types', 'event_id', 'select') as event_ticket_types_auth_event_id_private,
  has_column_privilege('service_role', 'public.event_ticket_types', 'event_id', 'select') as event_ticket_types_service_role_keeps_access,
  has_column_privilege('anon', 'public.registration_activities', 'slug', 'select') as registration_activities_slug_public,
  has_column_privilege('anon', 'public.registration_activities', 'organizer_id', 'select') as registration_activities_organizer_id_private,
  has_column_privilege('authenticated', 'public.registration_activities', 'organizer_id', 'select') as registration_activities_auth_organizer_id_private,
  has_column_privilege('service_role', 'public.registration_activities', 'organizer_id', 'select') as registration_activities_service_role_keeps_access,
  has_column_privilege('anon', 'public.colectas', 'slug', 'select') as colectas_slug_public,
  has_column_privilege('anon', 'public.colectas', 'creator_id', 'select') as colectas_creator_id_private,
  has_column_privilege('authenticated', 'public.colectas', 'creator_id', 'select') as colectas_auth_creator_id_private,
  has_column_privilege('service_role', 'public.colectas', 'creator_id', 'select') as colectas_service_role_keeps_access,
  has_column_privilege('anon', 'public.medidores_qr', 'slug', 'select') as medidores_qr_slug_public,
  has_column_privilege('anon', 'public.medidores_qr', 'organizer_id', 'select') as medidores_qr_organizer_id_private,
  has_column_privilege('authenticated', 'public.medidores_qr', 'organizer_id', 'select') as medidores_qr_auth_organizer_id_private,
  has_column_privilege('service_role', 'public.medidores_qr', 'organizer_id', 'select') as medidores_qr_service_role_keeps_access;
