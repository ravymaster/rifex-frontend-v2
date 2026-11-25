-- db/rollback/2026-11-06b_initiatives_public_column_grants_rollback.sql
-- Reversión de db/migrations/2026-11-06b_initiatives_public_column_grants.sql:
-- restaura los permisos de tabla por defecto de Supabase y retira los
-- permisos por columna. Idempotente.

begin;

revoke select (
  id,
  slug,
  title,
  description,
  cover_image_url,
  gallery_urls,
  starts_at,
  ends_at,
  timezone,
  venue_name,
  address,
  terms_text,
  status,
  capacity,
  created_at
) on table public.events from anon, authenticated;
grant select on table public.events to anon, authenticated;

revoke select (
  id,
  name,
  price_cents,
  quantity_total,
  quantity_sold,
  quantity_reserved,
  max_per_order,
  sales_start_at,
  sales_end_at,
  sort_order,
  status
) on table public.event_ticket_types from anon, authenticated;
grant select on table public.event_ticket_types to anon, authenticated;

revoke select (
  id,
  slug,
  title,
  description,
  cover_image_url,
  starts_at,
  ends_at,
  timezone,
  venue_name,
  address,
  modality,
  instructions,
  organizer_name_snapshot,
  capacity,
  status
) on table public.registration_activities from anon, authenticated;
grant select on table public.registration_activities to anon, authenticated;

revoke select (
  id,
  slug,
  title,
  description,
  cover_image_url,
  gallery_urls,
  status,
  goal_cents,
  start_at,
  end_at,
  created_at
) on table public.colectas from anon, authenticated;
grant select on table public.colectas to anon, authenticated;

revoke select (
  id,
  slug,
  question,
  options,
  status,
  measurement_start,
  measurement_end,
  destination_url,
  destination_button_label
) on table public.medidores_qr from anon, authenticated;
grant select on table public.medidores_qr to anon, authenticated;

commit;
