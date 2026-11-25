-- db/rollback/2026-11-06_raffles_public_column_grants_rollback.sql
-- Reversión de db/migrations/2026-11-06_raffles_public_column_grants.sql:
-- restaura los permisos de tabla por defecto de Supabase y retira los
-- permisos por columna. Idempotente.

begin;

revoke select (
  id, slug, title, description, status, theme, price_cents, total_numbers,
  prize_type, prize_amount_cents, prize_photos, delivery_method,
  requires_transfer_procedures, transfer_expenses_owner, transfer_conditions,
  features, timezone, start_date, end_date, sales_end_at, draw_at,
  extension_limit, extensions_used, created_at
) on table public.raffles from anon, authenticated;
grant select on table public.raffles to anon, authenticated;

revoke select (
  id, titulo, descripcion, tipo_premio, precio_clp, cupos, temas, inicio,
  termino, estado, created_at
) on table public.rifas from anon, authenticated;
grant select on table public.rifas to anon, authenticated;

grant select on table public.raffle_results to anon, authenticated;

commit;
