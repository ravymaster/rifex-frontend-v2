-- db/migrations/2026-11-06_raffles_public_column_grants.sql
-- Limitar campos públicos de rifas: los roles de cliente leen solo las
-- columnas públicas de `raffles` y de la tabla heredada `rifas`. Las
-- lecturas del servidor no cambian.
--
-- Los permisos se otorgan por columna (primero se retira el permiso de
-- tabla, que tiene precedencia). Una columna que no esté en la lista no
-- es pública, incluidas las que se agreguen en el futuro.
--
-- Lista alineada con src/lib/publicRaffleFields.js (PUBLIC_RAFFLE_COLUMNS,
-- LEGACY_RIFAS_SELECT). `raffle_results` solo se consulta desde el
-- servidor.
--
-- Idempotente. Reversión:
-- db/rollback/2026-11-06_raffles_public_column_grants_rollback.sql.
-- Sin DDL de tablas, sin funciones, sin cambios de datos.

begin;

revoke select on table public.raffles from anon, authenticated;
grant select (
  id,
  slug,
  title,
  description,
  status,
  theme,
  price_cents,
  total_numbers,
  prize_type,
  prize_amount_cents,
  prize_photos,
  delivery_method,
  requires_transfer_procedures,
  transfer_expenses_owner,
  transfer_conditions,
  features,
  timezone,
  start_date,
  end_date,
  sales_end_at,
  draw_at,
  extension_limit,
  extensions_used,
  created_at
) on table public.raffles to anon, authenticated;

revoke select on table public.rifas from anon, authenticated;
grant select (
  id,
  titulo,
  descripcion,
  tipo_premio,
  precio_clp,
  cupos,
  temas,
  inicio,
  termino,
  estado,
  created_at
) on table public.rifas to anon, authenticated;

revoke select on table public.raffle_results from anon, authenticated;

commit;
