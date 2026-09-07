-- RAFFLE VISUAL POLISH (2026-09-07) — columnas aditivas para el rediseño
-- aprobado de la ficha pública de rifa (brief de Doris, punto 4 y 5):
--   - features: características dinámicas clave/valor declaradas por el
--     creador en /crear-rifa (ej. Marca/Lamborghini, Año/2024).
--   - slug: URL amigable (/rifas/lambo) generada server-side desde el
--     título al crear, con UUID interno intacto como identificador real —
--     nunca reemplaza a `id`, solo lo complementa para el link público.
-- Ambas columnas son nullable/con default seguro — cero impacto en filas
-- existentes ni en ningún flujo de compra/sorteo/pago ya certificado.
alter table public.raffles
  add column if not exists slug text,
  add column if not exists features jsonb not null default '[]'::jsonb;

-- Único solo donde no es null — permite backfill gradual y no bloquea
-- filas históricas que se queden sin slug.
create unique index if not exists raffles_slug_unique_idx
  on public.raffles (slug)
  where slug is not null;

-- Backfill de rifas ya existentes sin slug (histórico, incluyendo la rifa
-- de prueba "Lambo" creada durante esta misma sesión de QA) — mismo
-- criterio de slugify usado en el código (minúsculas, sin acentos,
-- separador '-'), con un sufijo corto del id para evitar colisiones sin
-- necesitar coordinación con el código JS en este paso único.
update public.raffles
set slug = trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'))
           || '-' || substr(id::text, 1, 6)
where slug is null;

-- create_raffle_with_declarations (RPC atómica ya certificada, usada por
-- POST /api/rifas): se extiende de forma aditiva para insertar slug y
-- features junto con el resto de la rifa en la misma transacción — nunca
-- se reemplaza su lógica real de reserva/atomicidad, solo se agregan dos
-- columnas más al INSERT ya existente.
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
    extension_limit, draw_at, sales_end_at, timezone, slug, features
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
    p_raffle->>'slug',
    case when jsonb_typeof(p_raffle->'features') = 'array' then p_raffle->'features' else '[]'::jsonb end
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
