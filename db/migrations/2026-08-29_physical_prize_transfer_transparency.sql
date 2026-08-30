-- 2026-08-29_physical_prize_transfer_transparency.sql
-- RIFEX CLOSURE PASS — transparencia de premios físicos: si un premio
-- requiere transferencia/trámites (ej. vehículo, propiedad), el creador
-- debe declarar quién asume los gastos y bajo qué condiciones ANTES de
-- publicar. Nunca reemplaza a Rifex Cumplimiento (roadmap, no
-- implementado todavía) — solo prepara los datos que ese futuro motor
-- podrá usar.
--
-- Aditiva, solo aplicada a rifex-dev. No migra datos históricos: una
-- rifa antigua con requires_transfer_procedures=false (el default)
-- simplemente no declaró trámites bajo este contrato nuevo — nunca debe
-- interpretarse como "transferencia incluida" ni "sin trámites
-- confirmado".

ALTER TABLE public.raffles
  ADD COLUMN IF NOT EXISTS requires_transfer_procedures boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_expenses_owner text,
  ADD COLUMN IF NOT EXISTS transfer_conditions text;

-- transfer_expenses_owner solo puede ser 'creator'/'winner' cuando está
-- presente (mismo criterio conceptual que ADR-1B: constraint declarativo,
-- nunca confiado solo a la validación de la API). NULL es válido —
-- significa "no aplica" (rifa de dinero, o físico sin trámites).
ALTER TABLE public.raffles
  DROP CONSTRAINT IF EXISTS raffles_transfer_expenses_owner_check;
ALTER TABLE public.raffles
  ADD CONSTRAINT raffles_transfer_expenses_owner_check
  CHECK (transfer_expenses_owner IS NULL OR transfer_expenses_owner IN ('creator', 'winner'));

COMMENT ON COLUMN public.raffles.requires_transfer_procedures IS
  'RIFEX CLOSURE PASS (2026-08-29): true solo si el creador declaró explícitamente que el premio físico requiere transferencia/trámites (ej. vehículo, propiedad). false en una rifa histórica NO significa "transferencia incluida" — significa que esa rifa no declaró nada bajo este contrato.';
COMMENT ON COLUMN public.raffles.transfer_expenses_owner IS
  'RIFEX CLOSURE PASS (2026-08-29): quién asume los gastos de transferencia/trámites — creator|winner. NULL si requires_transfer_procedures=false.';
COMMENT ON COLUMN public.raffles.transfer_conditions IS
  'RIFEX CLOSURE PASS (2026-08-29): texto libre con las condiciones de transferencia declaradas por el creador. NULL si requires_transfer_procedures=false.';

-- create_raffle_with_declarations (DRAW-1B, corregida en
-- 2026-08-20b_draw1b_fix_prize_photos_null.sql) hace un INSERT con lista
-- explícita de columnas desde el jsonb p_raffle — nunca un insert
-- dinámico. Sin este redefine, las 3 columnas nuevas quedarían
-- silenciosamente ignoradas aunque el API las mande. Mismo cuerpo que la
-- versión anterior, solo se agregan las 3 columnas nuevas al INSERT y al
-- SELECT del jsonb.
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
    extension_limit, draw_at, sales_end_at, timezone,
    requires_transfer_procedures, transfer_expenses_owner, transfer_conditions
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
    (
      select array_agg(x) from jsonb_array_elements_text(
        case when jsonb_typeof(p_raffle->'prize_photos') = 'array' then p_raffle->'prize_photos' else '[]'::jsonb end
      ) x
    ),
    nullif(p_raffle->>'start_date','')::date,
    nullif(p_raffle->>'end_date','')::date,
    p_raffle->>'status',
    p_raffle->>'creator_email',
    p_user_id,
    coalesce((p_raffle->>'extension_limit')::int, 0),
    nullif(p_raffle->>'draw_at','')::timestamptz,
    nullif(p_raffle->>'sales_end_at','')::timestamptz,
    nullif(p_raffle->>'timezone',''),
    coalesce((p_raffle->>'requires_transfer_procedures')::boolean, false),
    p_raffle->>'transfer_expenses_owner',
    p_raffle->>'transfer_conditions'
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

-- 2026-08-26c_event6_fase2_hardening_rifas_search_path_and_revoke.sql ya
-- fijó search_path=public y revocó EXECUTE de public/anon/authenticated
-- sobre esta función — create or replace NO restaura esos GRANT/REVOKE
-- (Postgres los conserva), pero se reafirman igual por transparencia y
-- para que esta migración sea autocontenida si algún día se re-ejecuta
-- sobre una base sin ese historial.
alter function public.create_raffle_with_declarations(jsonb, uuid, text[], text) set search_path = public;
revoke execute on function public.create_raffle_with_declarations(jsonb, uuid, text[], text) from public, anon, authenticated;
