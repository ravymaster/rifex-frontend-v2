-- RIFEX HUMAN URL STANDARD 2026 (2026-09-10) — columnas aditivas de slug
-- para Eventos, Campañas (Colectas) e Inscripciones, replicando
-- exactamente el patrón ya certificado en Rifas
-- (2026-09-07_raffle_slug_features.sql) y Medidor QR
-- (2026-09-08_medidor_qr_v1.sql): slug es un identificador público
-- adicional, generado server-side desde el título/nombre al crear, con
-- el UUID interno intacto como identidad real — nunca reemplaza a `id`,
-- solo lo complementa para el link público. Inmutable: ningún endpoint
-- de edición debe escribir esta columna después del insert inicial.
--
-- Todas las columnas son nullable — cero impacto en filas existentes ni
-- en ningún flujo de compra/checkout/pago/scanner/inscripción ya
-- certificado. El backfill de abajo usa el MISMO criterio de slugify
-- (minúsculas, sin acentos, separador '-') que src/lib/slugify.js, con
-- sufijo corto del id para evitar colisiones sin coordinar con JS.

-- =====================================================================
-- events
-- =====================================================================
alter table public.events
  add column if not exists slug text;

create unique index if not exists events_slug_unique_idx
  on public.events (slug)
  where slug is not null;

update public.events
set slug = trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'))
           || '-' || substr(id::text, 1, 6)
where slug is null;

-- =====================================================================
-- colectas
-- =====================================================================
alter table public.colectas
  add column if not exists slug text;

create unique index if not exists colectas_slug_unique_idx
  on public.colectas (slug)
  where slug is not null;

update public.colectas
set slug = trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'))
           || '-' || substr(id::text, 1, 6)
where slug is null;

-- =====================================================================
-- registration_activities
-- =====================================================================
alter table public.registration_activities
  add column if not exists slug text;

create unique index if not exists registration_activities_slug_unique_idx
  on public.registration_activities (slug)
  where slug is not null;

update public.registration_activities
set slug = trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'))
           || '-' || substr(id::text, 1, 6)
where slug is null;

-- =====================================================================
-- create_free_registration_activity: Inscripciones crea vía RPC
-- (a diferencia de Eventos/Colectas, que insertan directo), así que acá
-- SÍ hace falta extender la función. En vez de reemplazar la firma
-- existente (que rompería cualquier caller con la firma vieja), se
-- agrega un nuevo overload con p_slug como último parámetro con
-- default null — la función de 13 parámetros original queda intacta y
-- sin uso, nunca se dropea (regla forward-only). p_slug se calcula en
-- JS con el mismo slugify.js ya certificado (no se reimplementa la
-- normalización acá) y se reintenta con sufijo aleatorio en el propio
-- endpoint si esta función lanza 23505 (unique_violation) sobre el
-- índice de slug de arriba — el insert de registration_activities NO
-- tiene su propio bloque exception, así que ese error se propaga tal
-- cual al caller y, como ocurre ANTES del insert en
-- registration_free_usage, revierte toda la función sin consumir cupo.
-- =====================================================================
create or replace function public.create_free_registration_activity(
  p_organizer_id uuid,
  p_period_key text,
  p_title text,
  p_description text,
  p_cover_image_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_venue_name text,
  p_address text,
  p_modality text,
  p_instructions text,
  p_organizer_name_snapshot text,
  p_slug text default null
) returns public.registration_activities
language plpgsql
as $$
declare
  v_activity public.registration_activities;
begin
  insert into public.registration_activities
    (organizer_id, title, description, cover_image_url, starts_at, ends_at, timezone,
     venue_name, address, modality, instructions, organizer_name_snapshot,
     plan, capacity, status, slug)
  values
    (p_organizer_id, p_title, p_description, p_cover_image_url, p_starts_at, p_ends_at, p_timezone,
     p_venue_name, p_address, p_modality, p_instructions, p_organizer_name_snapshot,
     'free', 50, 'draft', p_slug)
  returning * into v_activity;

  begin
    insert into public.registration_free_usage (organizer_id, period_key, activity_id)
    values (p_organizer_id, p_period_key, v_activity.id);
  exception when unique_violation then
    raise exception 'free_quota_already_used' using errcode = 'P0001';
  end;

  return v_activity;
end;
$$;

revoke execute on function public.create_free_registration_activity(
  uuid, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_free_registration_activity(
  uuid, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, text
) to service_role;
