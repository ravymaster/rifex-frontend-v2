-- INSCRIPCIONES V1 FREE — foundation. Dominio nuevo e independiente:
-- NO toca events/event_ticket_types/event_orders/event_tickets/
-- event_staff/event_checkins ni raffles/colectas. Reutiliza únicamente
-- el patrón transversal ya certificado en EVENT-1..EVENT-8:
--   - RLS default-deny-en-writes (todo write pasa por API server-side
--     con service_role, que bypassa RLS);
--   - `registration_activities` con política SELECT pública acotada
--     (solo status='active'), mismo criterio que `events`;
--   - `registration_participants`/`registration_checkins`/
--     `registration_free_usage` con revoke all — CERO acceso público,
--     ni siquiera vía RLS policy (nunca exponer email/teléfono de
--     participantes, ver sección 26 del mandato);
--   - RPCs atómicas con `for update` como autoridad real de
--     concurrencia (nunca SELECT->JS->UPDATE) — mismo criterio que
--     create_event_order/issue_event_order_tickets/check_in_event_ticket.
--
-- INSCRIPCIONES = actividad SIN cobro al participante. No hay
-- Mercado Pago del organizador, no hay marketplace_fee, no hay
-- comisión, no hay Payment Engine involucrado en ningún punto de este
-- archivo — a propósito. Si algún día un organizador necesita cobrar
-- por participar, ese caso es EVENTOS, no una variante de esto.
--
-- PLUS/GOLD quedan modelados (ver registration_activities.plan y
-- src/lib/registrationPlans.js) pero NO son activables desde esta
-- migración ni desde ningún endpoint de esta misión — el único plan
-- que create_free_registration_activity puede escribir es 'free', con
-- capacity=50 hardcoded server-side. Ver
-- docs/inscripciones/INSCRIPCIONES_FUTURE_BILLING.md para el punto
-- exacto de integración futura.

-- =====================================================================
-- registration_activities
-- =====================================================================
create table if not exists public.registration_activities (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null,

  title text not null,
  description text,
  cover_image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'America/Santiago',
  venue_name text,
  address text,
  -- "lugar/modalidad" del mandato: presencial/online/híbrida.
  modality text not null default 'presencial',
  instructions text,

  -- Snapshot del nombre visible del organizador (persona u
  -- organización), tomado de trust_onboarding en el momento de crear —
  -- mismo criterio que ticket_type_name_snapshot en EVENT-3: la
  -- actividad y el correo de confirmación deben seguir siendo
  -- comprensibles aunque el usuario edite su nombre después.
  organizer_name_snapshot text,

  -- Única autoridad de capacidad: plan+capacity, escritos SIEMPRE por
  -- backend (create_free_registration_activity), nunca por el cliente
  -- directamente. Ver src/lib/registrationPlans.js.
  plan text not null default 'free',
  capacity integer not null,

  status text not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint registration_activities_plan_check check (plan in ('free', 'plus', 'gold')),
  constraint registration_activities_status_check check (status in ('draft', 'active', 'closed', 'archived')),
  constraint registration_activities_capacity_check check (capacity > 0),
  constraint registration_activities_modality_check check (modality in ('presencial', 'online', 'hibrida')),
  constraint registration_activities_dates_check check (ends_at is null or ends_at > starts_at)
);

create index if not exists registration_activities_organizer_id_idx on public.registration_activities(organizer_id);
create index if not exists registration_activities_status_idx on public.registration_activities(status);

-- =====================================================================
-- registration_participants. normalized_email es la autoridad real de
-- "duplicado" — UNIQUE por actividad, no un simple EXISTS previo (que
-- sería vulnerable a TOCTOU bajo concurrencia). qr_token es la única
-- credencial real, opaca, alta entropía, UNIQUE — mismo criterio que
-- event_tickets.qr_token.
-- =====================================================================
create table if not exists public.registration_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.registration_activities(id) on delete cascade,

  full_name text not null,
  email text not null,
  normalized_email text not null,
  phone text,

  qr_token text not null,

  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint registration_participants_unique_email_per_activity unique (activity_id, normalized_email),
  constraint registration_participants_qr_token_key unique (qr_token)
);

create index if not exists registration_participants_activity_id_idx on public.registration_participants(activity_id);
create index if not exists registration_participants_checked_in_idx
  on public.registration_participants(activity_id, checked_in_at) where checked_in_at is not null;

-- =====================================================================
-- registration_checkins: auditoría de accesos exitosos, nunca se borra
-- ni se actualiza. checked_in_at en registration_participants es la
-- autoridad de consumo primaria (protegida por el lock de fila en
-- check_in_registration_participant); el UNIQUE de acá es defensa en
-- profundidad, mismo criterio que event_checkins.
-- =====================================================================
create table if not exists public.registration_checkins (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.registration_activities(id) on delete cascade,
  participant_id uuid not null references public.registration_participants(id) on delete cascade,
  checked_in_by uuid not null,
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint registration_checkins_participant_unique unique (participant_id)
);

create index if not exists registration_checkins_activity_id_idx on public.registration_checkins(activity_id);

-- =====================================================================
-- registration_free_usage: ledger insert-only, NUNCA se borra, NUNCA se
-- actualiza. Es la autoridad real y durable de "1 FREE por mes
-- calendario por cuenta" — el UNIQUE (organizer_id, period_key) es la
-- propia autoridad de concurrencia (dos inserts simultáneos para el
-- mismo organizador+mes: solo uno gana, el otro recibe unique_violation
-- dentro de la misma llamada RPC). period_key es el mes calendario en
-- UTC ("YYYY-MM"), calculado en src/lib/registrationFreeQuota.js —
-- criterio único y documentado, nunca rolling 30 días.
--
-- activity_id NO tiene "on delete cascade" a propósito: hoy no existe
-- ningún endpoint que borre filas de registration_activities (solo
-- transiciones de status hacia 'archived'), así que esta referencia
-- nunca debería bloquear nada en la práctica — pero si alguna vez se
-- agregara un borrado real, el default "no action" impediría borrar una
-- actividad que todavía consume cupo histórico, en vez de dejar
-- silenciosamente huérfano (o peor, resetear) el consumo ya registrado.
-- =====================================================================
create table if not exists public.registration_free_usage (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null,
  period_key text not null,
  activity_id uuid not null references public.registration_activities(id),
  created_at timestamptz not null default now(),
  constraint registration_free_usage_one_per_period unique (organizer_id, period_key)
);

create index if not exists registration_free_usage_organizer_id_idx on public.registration_free_usage(organizer_id);

-- =====================================================================
-- create_free_registration_activity: única función que puede insertar
-- con plan='free'. Nunca acepta plan/capacity como parámetro — los
-- hardcodea siempre a 'free'/50, así que no existe ningún camino, ni
-- siquiera a nivel de firma de función, para que un caller (aunque
-- comprometiera la API) pida un plan distinto por esta vía. La
-- atomicidad "actividad + consumo del cupo mensual" corre en una sola
-- transacción implícita: si el insert en registration_free_usage falla
-- por unique_violation (cupo ya usado este mes), TODO el insert de la
-- actividad también se revierte — nunca queda una actividad "free"
-- huérfana sin su fila de consumo correspondiente.
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
  p_organizer_name_snapshot text
) returns public.registration_activities
language plpgsql
as $$
declare
  v_activity public.registration_activities;
begin
  insert into public.registration_activities
    (organizer_id, title, description, cover_image_url, starts_at, ends_at, timezone,
     venue_name, address, modality, instructions, organizer_name_snapshot,
     plan, capacity, status)
  values
    (p_organizer_id, p_title, p_description, p_cover_image_url, p_starts_at, p_ends_at, p_timezone,
     p_venue_name, p_address, p_modality, p_instructions, p_organizer_name_snapshot,
     'free', 50, 'draft')
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
  uuid, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_free_registration_activity(
  uuid, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text
) to service_role;

-- =====================================================================
-- register_for_activity: autoridad atómica de inscripción de un
-- participante. El lock `for update` sobre la fila de la actividad es
-- la autoridad real de concurrencia para el aforo — serializa cualquier
-- llamada simultánea sobre la MISMA actividad, así que el conteo de
-- confirmados que se lee después del lock siempre refleja el estado
-- real, incluso bajo una ráfaga de inscripciones simultáneas en el
-- límite exacto de capacidad (caso adversarial 49/50 + 2 simultáneas
-- del mandato). El UNIQUE de (activity_id, normalized_email) es defensa
-- en profundidad adicional para el caso de duplicados, capturada vía
-- unique_violation.
-- =====================================================================
create or replace function public.register_for_activity(
  p_activity_id uuid,
  p_full_name text,
  p_email text,
  p_phone text
) returns jsonb
language plpgsql
as $$
declare
  v_activity public.registration_activities;
  v_confirmed_count integer;
  v_normalized_email text;
  v_participant public.registration_participants;
  v_qr_token text;
begin
  if p_activity_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_activity');
  end if;
  if p_full_name is null or length(trim(p_full_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if p_email is null or length(trim(p_email)) < 3 or position('@' in p_email) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  v_normalized_email := lower(trim(p_email));

  select * into v_activity from public.registration_activities where id = p_activity_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'activity_not_found');
  end if;
  if v_activity.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'activity_not_active');
  end if;

  select count(*) into v_confirmed_count
  from public.registration_participants
  where activity_id = p_activity_id;

  if v_confirmed_count >= v_activity.capacity then
    return jsonb_build_object('ok', false, 'error', 'capacity_full');
  end if;

  -- Mismo idioma de token que qr_token en EVENT-3 (dos UUID sin guiones
  -- concatenados = 64 chars hex, alta entropía, sin depender de
  -- pgcrypto/gen_random_bytes).
  v_qr_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  begin
    insert into public.registration_participants
      (activity_id, full_name, email, normalized_email, phone, qr_token)
    values
      (p_activity_id, trim(p_full_name), p_email, v_normalized_email, nullif(trim(coalesce(p_phone, '')), ''), v_qr_token)
    returning * into v_participant;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end;

  return jsonb_build_object(
    'ok', true,
    'participant_id', v_participant.id,
    'qr_token', v_participant.qr_token
  );
end;
$$;

revoke execute on function public.register_for_activity(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.register_for_activity(uuid, text, text, text) to service_role;

-- =====================================================================
-- check_in_registration_participant: autoridad atómica de check-in.
-- Mismo orden de validación que check_in_event_ticket (EVENT-4): se
-- resuelve y lockea el participante PRIMERO por qr_token (su
-- activity_id real es la única fuente confiable para "pertenece a esta
-- actividad"), nunca se confía en qué p_activity_id mandó el cliente
-- para otra cosa que no sea esa comparación.
--
-- V1 es owner-only (decisión documentada: agregar un rol de staff
-- equivalente a event_staff/`door` habría duplicado esa tabla completa
-- para un producto todavía gratuito de validación — se puede agregar
-- después sin tocar esta función, solo ampliando la condición de
-- v_authorized). Sin SECURITY DEFINER por el mismo motivo que
-- check_in_event_ticket: ya corre como service_role, que ya tiene los
-- privilegios reales necesarios.
-- =====================================================================
create or replace function public.check_in_registration_participant(
  p_qr_token text,
  p_actor_user_id uuid,
  p_activity_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_participant public.registration_participants;
  v_activity public.registration_activities;
  v_checkin public.registration_checkins;
begin
  if p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_actor');
  end if;
  if p_activity_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_activity');
  end if;
  if p_qr_token is null or length(p_qr_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_participant from public.registration_participants where qr_token = p_qr_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'participant_not_found');
  end if;

  if v_participant.activity_id <> p_activity_id then
    return jsonb_build_object('ok', false, 'error', 'wrong_activity');
  end if;

  select * into v_activity from public.registration_activities where id = p_activity_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'activity_not_found');
  end if;

  if v_activity.organizer_id <> p_actor_user_id then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if v_participant.checked_in_at is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_used',
      'checked_in_at', v_participant.checked_in_at,
      'participant', jsonb_build_object('full_name', v_participant.full_name)
    );
  end if;

  update public.registration_participants
    set checked_in_at = now(), checked_in_by = p_actor_user_id, updated_at = now()
    where id = v_participant.id
    returning * into v_participant;

  insert into public.registration_checkins (activity_id, participant_id, checked_in_by)
    values (p_activity_id, v_participant.id, p_actor_user_id)
    returning * into v_checkin;

  return jsonb_build_object(
    'ok', true,
    'result', 'pass',
    'participant', jsonb_build_object('full_name', v_participant.full_name, 'checked_in_at', v_participant.checked_in_at),
    'checkin_id', v_checkin.id
  );
end;
$$;

revoke execute on function public.check_in_registration_participant(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_in_registration_participant(text, uuid, uuid) to service_role;

-- =====================================================================
-- RLS. registration_activities sigue el criterio de `events`: RLS
-- habilitado + una política SELECT pública acotada (status='active'),
-- SIN revoke all (los grants por defecto de Supabase sobre anon/
-- authenticated quedan, la política es el filtro real) — así un
-- organizador autenticado también puede leer sus propias actividades
-- en cualquier estado vía la API (que usa service_role, que bypassa
-- RLS de todas formas).
--
-- registration_participants/registration_checkins/registration_free_usage
-- siguen el criterio de event_tickets/event_staff/event_checkins:
-- revoke all — CERO acceso público, ni siquiera de solo lectura. Nunca
-- se expone email/teléfono de un participante por ningún camino que no
-- sea la API owner-only (ver sección 26 del mandato).
-- =====================================================================
alter table public.registration_activities enable row level security;
alter table public.registration_participants enable row level security;
alter table public.registration_checkins enable row level security;
alter table public.registration_free_usage enable row level security;

drop policy if exists registration_activities_select_public on public.registration_activities;
create policy registration_activities_select_public
on public.registration_activities
for select
to anon, authenticated
using (status = 'active');

revoke all on public.registration_participants from public, anon, authenticated;
revoke all on public.registration_checkins from public, anon, authenticated;
revoke all on public.registration_free_usage from public, anon, authenticated;
