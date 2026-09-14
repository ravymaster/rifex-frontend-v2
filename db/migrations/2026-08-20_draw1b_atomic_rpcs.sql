-- DRAW-1B: hardening — declaraciones legales fail-closed + extensiones
-- atómicas. Dos funciones Postgres mínimas, sin RLS/SECURITY DEFINER (todo
-- el acceso ya pasa por el service-role client, que ignora RLS de por sí).
-- Aditiva: no toca columnas ni tablas existentes. Aplicada únicamente en
-- rifex-dev.

-- 1) Crear rifa + declaraciones legales en una sola transacción. Si falla
--    el insert de legal_declarations (por el motivo que sea), la excepción
--    revierte también el insert de la rifa — nunca queda una rifa sin
--    evidencia de aceptación 18+/premio.
create or replace function public.create_raffle_with_declarations(
  p_raffle jsonb,
  p_user_id uuid,
  p_declaration_types text[],
  p_policy_version text default 'v1.0'
) returns public.raffles
language plpgsql
as $$
declare
  v_raffle public.raffles;
  v_type text;
begin
  insert into public.raffles (
    title, price_cents, total_numbers, description, plan, theme,
    prize_type, prize_amount_cents, payout_method, delivery_method,
    prize_photos, start_date, end_date, status, creator_email, creator_id,
    extension_limit, draw_at, sales_end_at, timezone
  )
  select
    p_raffle->>'title',
    (p_raffle->>'price_cents')::int,
    (p_raffle->>'total_numbers')::int,
    p_raffle->>'description',
    p_raffle->>'plan',
    p_raffle->>'theme',
    p_raffle->>'prize_type',
    nullif(p_raffle->>'prize_amount_cents','')::int,
    p_raffle->>'payout_method',
    p_raffle->>'delivery_method',
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_raffle->'prize_photos','[]'::jsonb)) x),
    nullif(p_raffle->>'start_date','')::date,
    nullif(p_raffle->>'end_date','')::date,
    p_raffle->>'status',
    p_raffle->>'creator_email',
    p_user_id,
    coalesce((p_raffle->>'extension_limit')::int, 0),
    nullif(p_raffle->>'draw_at','')::timestamptz,
    nullif(p_raffle->>'sales_end_at','')::timestamptz,
    nullif(p_raffle->>'timezone','')
  returning * into v_raffle;

  if p_declaration_types is null or array_length(p_declaration_types, 1) is null then
    raise exception 'missing_declarations';
  end if;

  foreach v_type in array p_declaration_types loop
    insert into public.legal_declarations (user_id, entity_type, entity_id, declaration_type, policy_version)
    values (p_user_id, 'raffle', v_raffle.id, v_type, p_policy_version);
  end loop;

  return v_raffle;
end;
$$;

-- 2) Extender fecha de sorteo de forma atómica. Bloquea la fila (FOR
--    UPDATE) para que dos extensiones concurrentes no puedan pisarse ni
--    duplicar extensions_used. Toda la validación de autoridad (ownership,
--    límite, ganador previo, fecha futura, anticipación mínima) vive acá,
--    no en la capa HTTP — es la fuente de verdad real.
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
