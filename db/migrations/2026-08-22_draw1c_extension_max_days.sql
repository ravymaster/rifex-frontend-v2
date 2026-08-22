-- EXT-1: tope de 15 días por extensión individual. Decisión de producto:
-- una sola extensión no puede mover el sorteo más de MAX_EXTENSION_DAYS
-- días respecto del draw_at VIGENTE (no del original de creación) — con
-- extension_limit=3, el aplazamiento acumulable máximo queda en 45 días,
-- nunca un límite absoluto de vida de la rifa (fuera de alcance de EXT-1).
-- Aditiva: no toca columnas ni tablas, solo reemplaza el cuerpo de la RPC
-- existente (mismo patrón que 2026-08-20b_draw1b_fix_prize_photos_null.sql).
-- No introduce conversión timezone-naive: toda la comparación ocurre sobre
-- timestamptz ya resueltos (instantes UTC reales), igual que el resto de
-- la función — la aritmética de intervalos sobre timestamptz en Postgres
-- es segura frente a DST.
create or replace function public.extend_raffle_draw(
  p_raffle_id uuid,
  p_user_id uuid,
  p_new_draw_at timestamptz,
  p_new_sales_end_at timestamptz,
  p_reason text default null
) returns public.raffles
language plpgsql
as $$
declare
  v_raffle public.raffles;
  v_prev_draw_at timestamptz;
  v_prev_sales_end_at timestamptz;
  v_has_winner boolean;
  v_max_extension_days constant int := 15; -- EXT-1: MAX_EXTENSION_DAYS
begin
  select * into v_raffle from public.raffles where id = p_raffle_id for update;
  if not found then
    raise exception 'raffle_not_found';
  end if;
  if v_raffle.creator_id is distinct from p_user_id then
    raise exception 'not_your_raffle';
  end if;
  if v_raffle.draw_at is null or v_raffle.timezone is null then
    raise exception 'no_draw_at_configured';
  end if;
  if coalesce(v_raffle.extension_limit, 0) <= 0 then
    raise exception 'extensions_not_allowed';
  end if;
  if coalesce(v_raffle.extensions_used, 0) >= v_raffle.extension_limit then
    raise exception 'extension_limit_reached';
  end if;
  if v_raffle.draw_at <= now() then
    raise exception 'draw_at_already_passed';
  end if;

  select exists(select 1 from public.raffle_results where raffle_id = p_raffle_id) into v_has_winner;
  if v_has_winner then
    raise exception 'winner_already_exists';
  end if;

  if p_new_draw_at <= now() then
    raise exception 'new_draw_at_must_be_future';
  end if;
  if p_new_draw_at <= v_raffle.draw_at then
    raise exception 'new_draw_at_must_be_later';
  end if;
  -- EXT-1: current_draw_at < new_draw_at <= current_draw_at + 15 días.
  -- Se mide siempre desde el draw_at VIGENTE (v_raffle.draw_at, ya
  -- actualizado por cualquier extensión previa), nunca desde el original.
  if p_new_draw_at > v_raffle.draw_at + make_interval(days => v_max_extension_days) then
    raise exception 'extension_too_long';
  end if;
  if p_new_draw_at < now() + interval '10 minutes' then
    raise exception 'new_draw_at_too_soon';
  end if;

  v_prev_draw_at := v_raffle.draw_at;
  v_prev_sales_end_at := v_raffle.sales_end_at;

  update public.raffles
    set draw_at = p_new_draw_at,
        sales_end_at = p_new_sales_end_at,
        extensions_used = coalesce(v_raffle.extensions_used, 0) + 1
    where id = p_raffle_id
    returning * into v_raffle;

  insert into public.raffle_date_extensions
    (raffle_id, previous_draw_at, new_draw_at, previous_sales_end_at, new_sales_end_at, changed_by, reason)
  values
    (p_raffle_id, v_prev_draw_at, p_new_draw_at, v_prev_sales_end_at, p_new_sales_end_at, p_user_id, p_reason);

  return v_raffle;
end;
$$;
