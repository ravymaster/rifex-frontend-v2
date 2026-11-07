-- MEDIDOR QR V1 — foundation. Dominio nuevo e independiente: NO toca
-- raffles/colectas/events/event_*/registration_* ni ninguna función/
-- tabla existente. Reemplaza por completo el mandato anterior
-- "MEDIDOR DE CONVOCATORIA V1" (nunca aplicado más allá de un fixture
-- desechable, revertido antes de este archivo) — modelo de datos
-- incompatible: preguntas personalizadas de 2-4 opciones + cuota
-- mensual + Excel + destino opcional, en vez de 4 respuestas fijas de
-- asistencia.
--
-- CUOTA MENSUAL (sección 1/23 del mandato): reutiliza el MISMO patrón
-- exacto ya certificado en INSCRIPCIONES V1
-- (registration_free_usage + currentFreePeriodKey/"YYYY-MM" mes
-- calendario UTC, nunca rolling 30 días) — nunca un segundo sistema de
-- entitlement. `medidor_qr_free_usage` es su hermana exacta: ledger
-- insert-only, UNIQUE(organizer_id, period_key) es la propia autoridad
-- de concurrencia (dos creaciones simultáneas mismo organizador+mes:
-- solo una gana, la otra recibe unique_violation dentro de la misma
-- llamada RPC — nunca dos Medidores QR el mismo mes por una carrera).
--
-- Slug humano (sección 6 del mandato, "slug amigable cuando
-- corresponda"): mismo sistema ya certificado en Rifas (slugify.js +
-- retry-on-23505 desde JS) — un solo QR público por Medidor, nunca un
-- token opaco por persona.
--
-- Respuestas 100% ANÓNIMAS, misma anti-duplicación por visitor_key
-- opaco de navegador (localStorage) que la misión anterior — ver
-- src/lib/medidorQrVisitor.js. UNIQUE(medidor_qr_id, visitor_key) es la
-- autoridad real en responses/visits/destination_clicks.

-- =====================================================================
-- medidores_qr
-- =====================================================================
create table if not exists public.medidores_qr (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null,

  -- Snapshot del nombre visible del organizador, mismo criterio que
  -- organizer_name_snapshot en registration_activities.
  organizer_name_snapshot text,

  -- EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (punto 3): nombre
  -- interno del Medidor, siempre distinto de la pregunta pública (ej.
  -- name="Vitrina septiembre", question="¿Qué producto te gustaría
  -- encontrar?"). Sirve para identificar el Medidor en "Mis Medidores
  -- QR" (búsqueda/listado) sin depender del texto exacto de la
  -- pregunta — siempre editable, incluso después de la primera
  -- respuesta (a diferencia de question/options).
  name text,

  question text not null,
  -- Array JSON de 2 a 4 strings, orden real de aparición pública.
  -- option_index en medidor_qr_responses referencia la posición acá.
  options jsonb not null,

  measurement_start timestamptz not null,
  measurement_end timestamptz not null,

  -- EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1 (punto 11): mismo
  -- patrón que events/inscripciones (default fijo 'America/Santiago',
  -- ver countryPolicy.js) — persistir explícitamente el timezone de
  -- presentación en vez de asumir conceptualmente que UTC representa
  -- el día local del organizador. No se deriva del país de onboarding
  -- (a diferencia de Rifas) porque Medidor QR, como Events/
  -- Inscripciones, es una herramienta gratuita sin gate de país.
  timezone text not null default 'America/Santiago',

  -- Extensión "destino opcional post-respuesta" (sección nueva del
  -- mandato). Ambos nullable — el creador puede dejar solo el
  -- agradecimiento sin destino. destination_url ya validado
  -- server-side (solo http/https, ver src/lib/safeExternalUrl.js)
  -- ANTES de llegar acá — nunca confiar en que la DB sea la única capa
  -- de validación, pero tampoco confiar solo en la API: ver también el
  -- CHECK de esquema abajo como defensa en profundidad barata.
  destination_url text,
  destination_button_label text,

  -- URL amigable pública (/m/<slug>) — mismo sistema de slugs de Rifas.
  slug text not null,

  -- Sección 21 del mandato: modelo mínimo. Sin 'draft' (la creación
  -- siempre deja el Medidor 'active' de inmediato — un solo botón
  -- "Crear y generar QR", sin paso de publicación separado) y sin
  -- 'paused' (el dashboard de la sección 11 solo expone Abrir/Cerrar,
  -- nunca Pausar/Reanudar) — los estados "aún no comienza"/"finalizada"
  -- que pide la sección 5 se DERIVAN de measurement_start/end en tiempo
  -- de lectura (ver respond_to_medidor_qr y la página pública), nunca
  -- son un valor persistido aparte. 'closed' es terminal, activado
  -- manualmente desde el dashboard.
  status text not null default 'active',

  -- Autoridad real de "escaneos" (crudo, sin deduplicar) — solo se
  -- escribe vía record_medidor_qr_visit (RPC).
  scan_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint medidores_qr_status_check check (status in ('active', 'closed')),
  constraint medidores_qr_slug_key unique (slug),
  constraint medidores_qr_scan_count_nonneg check (scan_count >= 0),
  constraint medidores_qr_question_length check (char_length(question) between 1 and 300),
  constraint medidores_qr_options_is_array check (jsonb_typeof(options) = 'array'),
  constraint medidores_qr_options_count check (jsonb_array_length(options) between 2 and 4),
  constraint medidores_qr_measurement_order check (measurement_end > measurement_start),
  constraint medidores_qr_destination_label_length check (destination_button_label is null or char_length(destination_button_label) <= 60)
);

create index if not exists medidores_qr_organizer_id_idx on public.medidores_qr(organizer_id);
create index if not exists medidores_qr_status_idx on public.medidores_qr(status);

-- =====================================================================
-- EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1: columnas aditivas
-- sobre una tabla que puede ya existir en rifex-dev (creada por la
-- versión anterior de este mismo archivo). `add column if not exists`
-- hace este bloque re-ejecutable sin destruir filas existentes.
-- name: backfill desde question para cualquier fila creada antes de
-- este punto (solo pudieron ser fixtures desechables de prueba de
-- concurrencia, nunca datos reales), después NOT NULL.
-- =====================================================================
alter table public.medidores_qr add column if not exists name text;
update public.medidores_qr set name = question where name is null;
alter table public.medidores_qr alter column name set not null;
alter table public.medidores_qr add column if not exists timezone text not null default 'America/Santiago';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'medidores_qr_name_length'
  ) then
    alter table public.medidores_qr
      add constraint medidores_qr_name_length check (char_length(name) between 1 and 120);
  end if;
end $$;

-- =====================================================================
-- medidor_qr_responses. option_index referencia la posición real dentro
-- de medidores_qr.options en el momento de responder (los options no
-- son editables después de crear, así que el índice nunca queda
-- huérfano). UNIQUE(medidor_qr_id, visitor_key) es la autoridad real de
-- "ya respondió" — anti-duplicación anónima.
-- =====================================================================
create table if not exists public.medidor_qr_responses (
  id uuid primary key default gen_random_uuid(),
  medidor_qr_id uuid not null references public.medidores_qr(id) on delete cascade,
  option_index integer not null,
  visitor_key text not null,
  created_at timestamptz not null default now(),

  constraint medidor_qr_responses_option_index_nonneg check (option_index >= 0),
  constraint medidor_qr_responses_unique_visitor unique (medidor_qr_id, visitor_key)
);

create index if not exists medidor_qr_responses_medidor_qr_id_idx on public.medidor_qr_responses(medidor_qr_id);

-- =====================================================================
-- medidor_qr_visits: un row por (medidor_qr_id, visitor_key) DISTINTO —
-- autoridad de "visitantes aproximados". Separada de
-- medidores_qr.scan_count (crudo, sin deduplicar) a propósito, mismo
-- criterio que la misión anterior.
-- =====================================================================
create table if not exists public.medidor_qr_visits (
  id uuid primary key default gen_random_uuid(),
  medidor_qr_id uuid not null references public.medidores_qr(id) on delete cascade,
  visitor_key text not null,
  created_at timestamptz not null default now(),

  constraint medidor_qr_visits_unique_visitor unique (medidor_qr_id, visitor_key)
);

create index if not exists medidor_qr_visits_medidor_qr_id_idx on public.medidor_qr_visits(medidor_qr_id);

-- =====================================================================
-- medidor_qr_destination_clicks: clics voluntarios al destino opcional
-- (extensión del mandato). Deduplicado por visitor_key igual que las
-- otras tablas de instrumentación — un mismo visitante haciendo clic
-- repetido no infla la métrica. La RPC exige que el visitor_key ya
-- tenga una respuesta registrada para este medidor antes de contar un
-- clic (el funnel real es ESCANEOS -> RESPUESTAS -> CLICS, nunca un
-- clic sin respuesta previa).
-- =====================================================================
create table if not exists public.medidor_qr_destination_clicks (
  id uuid primary key default gen_random_uuid(),
  medidor_qr_id uuid not null references public.medidores_qr(id) on delete cascade,
  visitor_key text not null,
  created_at timestamptz not null default now(),

  constraint medidor_qr_destination_clicks_unique_visitor unique (medidor_qr_id, visitor_key)
);

create index if not exists medidor_qr_destination_clicks_medidor_qr_id_idx on public.medidor_qr_destination_clicks(medidor_qr_id);

-- =====================================================================
-- medidor_qr_free_usage: ledger insert-only, hermana exacta de
-- registration_free_usage. UNIQUE(organizer_id, period_key) es la
-- autoridad real y durable de "1 Medidor QR gratis por mes calendario
-- por cuenta". period_key calculado en
-- src/lib/registrationFreeQuota.js (REUSE DIRECT, sin duplicar la
-- función — mismo criterio "YYYY-MM" en UTC).
--
-- medidor_qr_id NO tiene "on delete cascade" a propósito, mismo motivo
-- que registration_free_usage: hoy no existe ningún endpoint que borre
-- filas de medidores_qr, así que esta referencia nunca debería bloquear
-- nada en la práctica, pero protege contra un borrado futuro que deje
-- huérfano (o resetee) el consumo ya registrado.
-- =====================================================================
create table if not exists public.medidor_qr_free_usage (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null,
  period_key text not null,
  medidor_qr_id uuid not null references public.medidores_qr(id),
  created_at timestamptz not null default now(),
  constraint medidor_qr_free_usage_one_per_period unique (organizer_id, period_key)
);

create index if not exists medidor_qr_free_usage_organizer_id_idx on public.medidor_qr_free_usage(organizer_id);

-- =====================================================================
-- create_medidor_qr: única función que puede insertar un Medidor QR.
-- Valida el conteo de opciones server-side como defensa en profundidad
-- (además del CHECK de esquema y de la validación en la API). Igual
-- estructura que create_free_registration_activity: el insert del
-- Medidor va SIN protección propia salvo por colisión de slug (un
-- unique_violation ahí solo significa "probá con otro slug", nunca
-- consumió cupo); el insert del ledger de cuota SÍ usa RAISE EXCEPTION
-- dentro de su bloque BEGIN/EXCEPTION — al no ser capturada por nada
-- más arriba, esa excepción revierte TODA la llamada, incluido el
-- insert del Medidor ya "exitoso" un momento antes. Así nunca queda un
-- Medidor huérfano sin su fila de consumo correspondiente.
--
-- EXTENSIÓN FINAL — ESCALABILIDAD E INTEGRIDAD V1: la firma original no
-- tenía p_name. `create or replace` no puede cambiar la lista de
-- parámetros de una función existente (crearía un overload duplicado en
-- vez de reemplazarla) — se elimina explícitamente la firma vieja antes
-- de crear la nueva, para no dejar dos versiones conviviendo en
-- rifex-dev.
-- =====================================================================
drop function if exists public.create_medidor_qr(
  uuid, text, text, text, jsonb, timestamptz, timestamptz, text, text, text
);

create or replace function public.create_medidor_qr(
  p_organizer_id uuid,
  p_period_key text,
  p_organizer_name_snapshot text,
  p_name text,
  p_question text,
  p_options jsonb,
  p_measurement_start timestamptz,
  p_measurement_end timestamptz,
  p_destination_url text,
  p_destination_button_label text,
  p_slug text
) returns jsonb
language plpgsql
as $$
declare
  v_medidor public.medidores_qr;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 or jsonb_array_length(p_options) > 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_options');
  end if;
  if p_name is null or char_length(trim(p_name)) < 1 or char_length(p_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  begin
    insert into public.medidores_qr (
      organizer_id, organizer_name_snapshot, name, question, options,
      measurement_start, measurement_end, destination_url, destination_button_label, slug
    )
    values (
      p_organizer_id, p_organizer_name_snapshot, p_name, p_question, p_options,
      p_measurement_start, p_measurement_end, p_destination_url, p_destination_button_label, p_slug
    )
    returning * into v_medidor;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'slug_collision');
  end;

  begin
    insert into public.medidor_qr_free_usage (organizer_id, period_key, medidor_qr_id)
    values (p_organizer_id, p_period_key, v_medidor.id);
  exception when unique_violation then
    raise exception 'free_quota_already_used' using errcode = 'P0001';
  end;

  return jsonb_build_object('ok', true, 'medidor', to_jsonb(v_medidor));
end;
$$;

revoke execute on function public.create_medidor_qr(
  uuid, text, text, text, text, jsonb, timestamptz, timestamptz, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_medidor_qr(
  uuid, text, text, text, text, jsonb, timestamptz, timestamptz, text, text, text
) to service_role;

-- =====================================================================
-- respond_to_medidor_qr: autoridad atómica de una respuesta anónima.
-- Gate temporal real acá (measurement_start/end), no solo en la UI —
-- section 5/21 del mandato: "no confiar únicamente en UI". Sin
-- `for update`: mismo razonamiento que respond_to_convocatoria — no hay
-- ningún recurso finito que contar, el UNIQUE de la tabla ya es
-- suficiente autoridad de concurrencia para el caso "misma persona
-- responde dos veces a la vez".
-- =====================================================================
create or replace function public.respond_to_medidor_qr(
  p_medidor_qr_id uuid,
  p_option_index integer,
  p_visitor_key text
) returns jsonb
language plpgsql
as $$
declare
  v_medidor public.medidores_qr;
  v_response public.medidor_qr_responses;
begin
  if p_medidor_qr_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_medidor');
  end if;
  if p_visitor_key is null or length(p_visitor_key) < 16 or length(p_visitor_key) > 128 then
    return jsonb_build_object('ok', false, 'error', 'invalid_visitor');
  end if;

  select * into v_medidor from public.medidores_qr where id = p_medidor_qr_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'medidor_not_found');
  end if;
  if v_medidor.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'medidor_not_active');
  end if;
  if now() < v_medidor.measurement_start then
    return jsonb_build_object('ok', false, 'error', 'measurement_not_started');
  end if;
  if now() > v_medidor.measurement_end then
    return jsonb_build_object('ok', false, 'error', 'measurement_ended');
  end if;
  if p_option_index is null or p_option_index < 0 or p_option_index >= jsonb_array_length(v_medidor.options) then
    return jsonb_build_object('ok', false, 'error', 'invalid_option');
  end if;

  begin
    insert into public.medidor_qr_responses (medidor_qr_id, option_index, visitor_key)
    values (p_medidor_qr_id, p_option_index, p_visitor_key)
    returning * into v_response;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_responded');
  end;

  return jsonb_build_object(
    'ok', true,
    'response_id', v_response.id,
    'destination_url', v_medidor.destination_url,
    'destination_button_label', v_medidor.destination_button_label
  );
end;
$$;

revoke execute on function public.respond_to_medidor_qr(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.respond_to_medidor_qr(uuid, integer, text) to service_role;

-- =====================================================================
-- record_medidor_qr_visit: mismo patrón exacto que
-- record_convocatoria_visit — incrementa scan_count (crudo) + registra
-- visitante distinto (deduplicado) en la misma llamada.
-- =====================================================================
create or replace function public.record_medidor_qr_visit(
  p_medidor_qr_id uuid,
  p_visitor_key text
) returns jsonb
language plpgsql
as $$
declare
  v_exists boolean;
begin
  if p_medidor_qr_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_medidor');
  end if;
  if p_visitor_key is null or length(p_visitor_key) < 16 or length(p_visitor_key) > 128 then
    return jsonb_build_object('ok', false, 'error', 'invalid_visitor');
  end if;

  select exists(select 1 from public.medidores_qr where id = p_medidor_qr_id) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', false, 'error', 'medidor_not_found');
  end if;

  update public.medidores_qr set scan_count = scan_count + 1 where id = p_medidor_qr_id;

  insert into public.medidor_qr_visits (medidor_qr_id, visitor_key)
  values (p_medidor_qr_id, p_visitor_key)
  on conflict (medidor_qr_id, visitor_key) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.record_medidor_qr_visit(uuid, text) from public, anon, authenticated;
grant execute on function public.record_medidor_qr_visit(uuid, text) to service_role;

-- =====================================================================
-- record_medidor_qr_destination_click: cuenta un clic voluntario al
-- destino SOLO si ese visitor_key ya tiene una respuesta registrada
-- para este medidor — el funnel real es escaneos -> respuestas ->
-- clics, nunca un clic huérfano sin respuesta previa. Deduplicado igual
-- que las otras tablas de instrumentación.
-- =====================================================================
create or replace function public.record_medidor_qr_destination_click(
  p_medidor_qr_id uuid,
  p_visitor_key text
) returns jsonb
language plpgsql
as $$
declare
  v_has_response boolean;
begin
  if p_medidor_qr_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_medidor');
  end if;
  if p_visitor_key is null or length(p_visitor_key) < 16 or length(p_visitor_key) > 128 then
    return jsonb_build_object('ok', false, 'error', 'invalid_visitor');
  end if;

  select exists(
    select 1 from public.medidor_qr_responses
    where medidor_qr_id = p_medidor_qr_id and visitor_key = p_visitor_key
  ) into v_has_response;
  if not v_has_response then
    return jsonb_build_object('ok', false, 'error', 'no_prior_response');
  end if;

  insert into public.medidor_qr_destination_clicks (medidor_qr_id, visitor_key)
  values (p_medidor_qr_id, p_visitor_key)
  on conflict (medidor_qr_id, visitor_key) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.record_medidor_qr_destination_click(uuid, text) from public, anon, authenticated;
grant execute on function public.record_medidor_qr_destination_click(uuid, text) to service_role;

-- =====================================================================
-- RLS. medidores_qr sigue el criterio de registration_activities/
-- convocatorias (misión anterior): RLS habilitado + política SELECT
-- pública acotada (status='active'), SIN revoke all. En la práctica la
-- app nunca hace SELECT directo desde el cliente contra esta tabla
-- (todo pasa por API server-side con service_role, que bypassa RLS de
-- todas formas) — la política se mantiene por consistencia con el
-- patrón transversal ya certificado, no porque algo dependa de ella hoy.
--
-- Las 4 tablas de instrumentación (responses/visits/destination_clicks/
-- free_usage) siguen el criterio de registration_participants: revoke
-- all — CERO acceso público, ni siquiera de solo lectura, aunque no
-- contengan PII.
-- =====================================================================
alter table public.medidores_qr enable row level security;
alter table public.medidor_qr_responses enable row level security;
alter table public.medidor_qr_visits enable row level security;
alter table public.medidor_qr_destination_clicks enable row level security;
alter table public.medidor_qr_free_usage enable row level security;

drop policy if exists medidores_qr_select_public on public.medidores_qr;
create policy medidores_qr_select_public
on public.medidores_qr
for select
to anon, authenticated
using (status = 'active');

revoke all on public.medidor_qr_responses from public, anon, authenticated;
revoke all on public.medidor_qr_visits from public, anon, authenticated;
revoke all on public.medidor_qr_destination_clicks from public, anon, authenticated;
revoke all on public.medidor_qr_free_usage from public, anon, authenticated;
