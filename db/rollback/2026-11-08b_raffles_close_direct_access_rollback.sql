-- db/rollback/2026-11-08b_raffles_close_direct_access_rollback.sql
-- Reversión de db/migrations/2026-11-08b_raffles_close_direct_access.sql:
-- restaura exactamente los privilegios previos de `anon` y `authenticated`
-- (incluidas las columnas públicas de raffles y rifas definidas en
-- db/migrations/2026-11-06_raffles_public_column_grants.sql).

begin;

grant all on table
  public.tickets,
  public.raffle_messages,
  public.rifa_tickets,
  public.raffles_compat,
  public.tickets_compat
to anon, authenticated;

grant insert, update, delete, truncate, references, trigger on table
  public.raffles,
  public.rifas,
  public.raffle_results
to anon, authenticated;

do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'grant maintain on table public.raffles, public.rifas, public.raffle_results to anon, authenticated';
  end if;
end $$;

grant select (
  id, slug, title, description, status, theme, price_cents, total_numbers,
  prize_type, prize_amount_cents, prize_photos, delivery_method,
  requires_transfer_procedures, transfer_expenses_owner, transfer_conditions,
  features, timezone, start_date, end_date, sales_end_at, draw_at,
  extension_limit, extensions_used, created_at
) on table public.raffles to anon, authenticated;

grant select (
  id, titulo, descripcion, tipo_premio, precio_clp, cupos, temas, inicio,
  termino, estado, created_at
) on table public.rifas to anon, authenticated;

commit;
