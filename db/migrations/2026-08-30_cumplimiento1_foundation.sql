-- CUMPLIMIENTO-1 — fundación técnica de Rifex Cumplimiento (seguimiento
-- post-rifa de la entrega del premio). Migración LOCAL, versionada,
-- aplicada únicamente a rifex-dev — NO a PROD. Rifex Cumplimiento sigue
-- siendo, después de esta migración, un roadmap público sin motor
-- automático: no hay cron, no hay emails, no hay Día 10/15/20, no hay
-- reputación. Esta migración solo prepara el dominio para que
-- CUMPLIMIENTO-2 pueda crear un caso cuando una rifa finalice con
-- ganador.
--
-- Separación de dominio deliberada: Trust (trust_onboarding,
-- trust_identity_*) es identidad/elegibilidad del creador ANTES de
-- publicar. Rifex Cumplimiento es cumplimiento de entrega DESPUÉS de que
-- una rifa ya finalizó con ganador. No se toca ninguna tabla ni columna
-- de Trust, Payment Engine, Country Gate ni Events en esta migración.

-- =====================================================================
-- 1) raffle_fulfillment_cases — un caso por rifa, snapshot inmutable de
--    las condiciones vigentes al momento del cierre.
--
--    raffle_id es la PRIMARY KEY (mismo patrón exacto que
--    public.raffle_results, ya certificado: "Colisión de PK: otro
--    disparador ya sorteó al mismo tiempo" en drawWinner.js). Esto hace
--    que "imposible crear múltiples casos activos para la misma rifa"
--    sea una garantía de base de datos, no solo de aplicación — un
--    segundo INSERT con el mismo raffle_id siempre falla con 23505,
--    exactamente el mismo patrón que raffle_results ya usa para
--    garantizar el sorteo exactly-once.
--
--    Referencia autoritativa del ganador: raffle_results.purchase_id
--    (FK real a purchases, ganadores son compradores invitados sin
--    cuenta Rifex — nunca hay un auth.users.id de ganador). Se
--    snapshotea también number/buyer_email/buyer_name porque
--    raffle_results ya los trata como snapshot al momento del sorteo
--    (ver drawWinner.js: buyer_email/buyer_name se copian desde
--    purchases en el momento, no se leen por join después) — el caso de
--    Cumplimiento hereda el mismo criterio, un nivel más abajo.
-- =====================================================================

create table if not exists public.raffle_fulfillment_cases (
  raffle_id uuid primary key references public.raffles(id) on delete cascade,

  -- Snapshot del creador — columna directa (no solo derivable por join)
  -- para que las políticas/queries de "mis casos" no dependan de que
  -- raffles.creator_id no cambie después — y porque es el mismo patrón
  -- ya usado en events/raffles (creator_id como columna propia, nunca
  -- solo una relación indirecta).
  creator_id uuid not null,

  -- Referencia autoritativa del ganador — nunca un segundo lugar donde
  -- reinventar quién ganó, solo lo que raffle_results ya decidió.
  winner_purchase_id uuid references public.purchases(id),
  winner_ticket_number integer not null,
  winner_buyer_email text,
  winner_buyer_name text,

  -- Snapshot de premio y condiciones de entrega/transferencia vigentes
  -- en el momento en que se creó el caso — una edición posterior de la
  -- rifa (si alguna vez se permite) nunca cambia retroactivamente lo
  -- que fue prometido a este ganador. Mismo contrato que
  -- RIFEX CLOSURE PASS (2026-08-29) ya define en raffles, solo congelado.
  raffle_title text not null,
  prize_type text not null,
  prize_amount_cents integer,
  delivery_method text,
  requires_transfer_procedures boolean not null default false,
  transfer_expenses_owner text,
  transfer_conditions text,

  -- Timestamps de referencia — cuándo cerró la rifa (ventas) y cuándo se
  -- determinó el ganador (raffle_results.created_at, snapshot en el
  -- momento de crear el caso).
  raffle_closed_at timestamptz,
  winner_determined_at timestamptz not null,

  -- Estado canónico actual (columna mutable, de lectura rápida) —
  -- respaldado por el log append-only de la sección 2 para que ningún
  -- cambio de estado se pierda sin auditoría. Ver justificación completa
  -- en docs/cumplimiento/CUMPLIMIENTO_1_FOUNDATION.md, sección "Estado
  -- mutable vs. event sourcing".
  status text not null default 'pending_delivery' check (status in (
    'pending_delivery',
    'creator_reported_delivered',
    'fulfillment_confirmed',
    'delivery_pending',
    'under_review',
    'unconfirmed'
  )),

  -- Respuesta actual de cada parte — mutable (una respuesta puede
  -- corregirse más adelante, ej. un ganador que primero dijo "todavía
  -- no" y luego confirma que sí recibió), pero CADA cambio queda
  -- registrado primero como evento append-only (sección 2) antes de
  -- sobreescribir estas columnas — nunca se pierde el historial aunque
  -- el valor "actual" cambie.
  creator_response text check (creator_response is null or creator_response in ('yes', 'coordinating', 'not_yet')),
  creator_response_at timestamptz,
  winner_response text check (winner_response is null or winner_response in ('yes', 'not_yet')),
  winner_response_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists raffle_fulfillment_cases_creator_idx
  on public.raffle_fulfillment_cases (creator_id, created_at);

create index if not exists raffle_fulfillment_cases_status_idx
  on public.raffle_fulfillment_cases (status);

create trigger trg_raffle_fulfillment_cases_updated
  before update on public.raffle_fulfillment_cases
  for each row execute function public.set_updated_at();

-- RLS default-deny total — mismo criterio exacto que trust_onboarding
-- (TRUST-1) y event_orders (EVENT-2): sin ninguna política de
-- SELECT/INSERT/UPDATE/DELETE para anon/authenticated, ni siquiera para
-- el propio creador dueño de la fila. Toda lectura/escritura pasa por
-- rutas API server-side con service_role (src/pages/api/panel/
-- cumplimiento*.js), que aplican el filtro de ownership en la query
-- (mismo patrón que src/pages/api/panel/raffles.js). El ganador, al no
-- tener necesariamente una cuenta Rifex, no puede tener una política
-- RLS basada en auth.uid() en esta fase — su acceso queda explícitamente
-- fuera de alcance de CUMPLIMIENTO-1 (ver mandato, sección 11).
alter table public.raffle_fulfillment_cases enable row level security;
revoke all on public.raffle_fulfillment_cases from public, anon, authenticated;

-- =====================================================================
-- 2) raffle_fulfillment_events — historial append-only. Mismo patrón
--    exacto que trust_identity_audit_log (TRUST-3A, 2026-08-27b): un
--    trigger rechaza UPDATE/DELETE incluso para quien conecte con
--    privilegios elevados por error de código — la única forma de
--    "corregir" el historial es una fila nueva.
-- =====================================================================

create table if not exists public.raffle_fulfillment_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.raffle_fulfillment_cases(raffle_id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('creator', 'winner', 'system', 'admin')),
  actor_user_id uuid,
  previous_status text,
  new_status text,
  -- Nunca secrets, nunca PII innecesaria — solo metadata operacional
  -- (ej. { "trigger_source": "manual_test" }). Ver mandato sección 10.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists raffle_fulfillment_events_case_idx
  on public.raffle_fulfillment_events (case_id, created_at);

alter table public.raffle_fulfillment_events enable row level security;
revoke all on public.raffle_fulfillment_events from public, anon, authenticated;

create function public.raffle_fulfillment_events_immutable()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
begin
  raise exception 'raffle_fulfillment_events es append-only: % no permitido', tg_op;
end;
$$;

create trigger trg_raffle_fulfillment_events_no_update
  before update on public.raffle_fulfillment_events
  for each row execute function public.raffle_fulfillment_events_immutable();

create trigger trg_raffle_fulfillment_events_no_delete
  before delete on public.raffle_fulfillment_events
  for each row execute function public.raffle_fulfillment_events_immutable();

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   drop trigger if exists trg_raffle_fulfillment_events_no_delete on public.raffle_fulfillment_events;
--   drop trigger if exists trg_raffle_fulfillment_events_no_update on public.raffle_fulfillment_events;
--   drop function if exists public.raffle_fulfillment_events_immutable();
--   drop table if exists public.raffle_fulfillment_events;
--   drop trigger if exists trg_raffle_fulfillment_cases_updated on public.raffle_fulfillment_cases;
--   drop table if exists public.raffle_fulfillment_cases;
-- Reversible sin pérdida de datos fuera de estas dos tablas nuevas — no
-- toca raffles, raffle_results, purchases, tickets, Trust, Events,
-- Colectas ni Payment Engine.
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Rifas, DRAW, Trust, Events, Colectas
-- ni pagos:
--   - Dos tablas enteramente nuevas, sin FK entrante desde ninguna tabla
--     existente — raffles/raffle_results/purchases no referencian estas
--     tablas en absoluto.
--   - No modifica ninguna tabla, función, política ni grant ya
--     existente — es puramente aditiva.
--   - drawWinner()/notifyWinnerDrawn() NO fueron modificados por esta
--     migración ni por CUMPLIMIENTO-1 — el punto de integración futuro
--     está documentado, no implementado (ver mandato sección 14 y
--     docs/cumplimiento/CUMPLIMIENTO_1_FOUNDATION.md).
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia —
--     el gate de aplicación es exclusivamente rifex-dev.
-- =====================================================================
