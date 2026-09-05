-- DRAW-2 FINAL: hotfix descubierto por QA visual real — crear_rifa_with_declarations
-- fallaba con "cannot extract elements from a scalar" cuando prize_photos
-- llegaba como JSON null explícito (el formulario real de crear-rifa.jsx
-- siempre manda la clave, con valor null para premios en dinero — a
-- diferencia de los tests de API que simplemente omitían la clave, por eso
-- el bug no se detectó hasta probar el flujo real en el navegador).
-- coalesce() solo reemplaza SQL NULL, no el escalar JSON null — por eso
-- jsonb_array_elements_text intentaba iterar un escalar. Se reemplaza por
-- un chequeo explícito de jsonb_typeof.
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
