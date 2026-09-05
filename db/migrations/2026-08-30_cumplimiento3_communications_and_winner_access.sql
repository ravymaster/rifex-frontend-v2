-- CUMPLIMIENTO-3 — comunicaciones Día 0 + acceso seguro del ganador
-- invitado a su caso. Migración LOCAL, versionada, aplicada únicamente
-- a rifex-dev — NO a PROD. Puramente aditiva: no modifica ninguna
-- columna, constraint, política ni grant de CUMPLIMIENTO-1/2, DRAW,
-- Trust, Events, Colectas ni Payment Engine.

-- =====================================================================
-- 1) raffle_fulfillment_cases — token de acceso del ganador invitado.
--
--    Se agrega acá (no en una tabla nueva) porque es 1:1 con el caso —
--    exactamente el mismo criterio que raffle_results/purchases ya
--    tratan su relación 1:1. NUNCA se guarda el token en texto plano:
--    solo su hash SHA-256 (32 bytes -> 64 hex). El token crudo se
--    genera en memoria de aplicación, se envía únicamente en el correo
--    del ganador (Día 0), y nunca se persiste — mismo principio que un
--    token de reseteo de contraseña. Se decidió NO reutilizar
--    ciegamente el patrón de event_orders.access_token (auditado antes
--    de decidir): ese token se guarda en texto plano en la columna
--    real, comparado por igualdad directa — aceptable para su propio
--    threat model, pero el mandato de esta misión pide explícitamente
--    no persistir el token del ganador en texto plano, así que se
--    diverge deliberadamente acá.
-- =====================================================================

alter table public.raffle_fulfillment_cases
  add column if not exists winner_access_token_hash text,
  add column if not exists winner_access_token_created_at timestamptz;

create unique index if not exists raffle_fulfillment_cases_winner_token_hash_key
  on public.raffle_fulfillment_cases (winner_access_token_hash)
  where winner_access_token_hash is not null;

-- =====================================================================
-- 2) raffle_fulfillment_communications — ledger idempotente de intentos
--    de comunicación. UNIQUE(case_id, communication_type, recipient_role)
--    es la autoridad real de "exactly-once intent": nunca se crea una
--    segunda fila lógica para el mismo (caso, tipo, destinatario) — un
--    reintento SIEMPRE actualiza la fila existente (attempt_count,
--    status, last_error_safe), nunca inserta una nueva. Esto es
--    intención exactly-once, no entrega exactly-once: un proveedor
--    externo (Resend) puede reintentar o duplicar por su cuenta, eso
--    queda fuera del control de esta tabla.
--
--    Sin recipient_reference (email/nombre) duplicado acá a propósito
--    — el destinatario real se resuelve en el momento del envío desde
--    raffle_fulfillment_cases (winner_buyer_email/winner_buyer_name) o
--    raffles.creator_email, evitando una segunda copia de PII que
--    pueda desincronizarse del snapshot ya congelado.
-- =====================================================================

create table if not exists public.raffle_fulfillment_communications (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.raffle_fulfillment_cases(raffle_id) on delete cascade,

  communication_type text not null check (communication_type in (
    'DAY_0_WINNER',
    'DAY_0_CREATOR',
    'DAY_10_WINNER',
    'DAY_10_CREATOR',
    'DAY_15_REMINDER_WINNER',
    'DAY_15_REMINDER_CREATOR',
    'DAY_20_INTERNAL_ESCALATION',
    'DAY_20_REVIEW_NOTICE_WINNER',
    'DAY_20_REVIEW_NOTICE_CREATOR'
  )),
  recipient_role text not null check (recipient_role in ('winner', 'creator')),

  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 0,

  -- ID de mensaje del proveedor (Resend `data.id`) cuando el envío real
  -- se aceptó — nunca el payload completo del proveedor.
  provider_message_id text,

  -- Reservado para fases futuras (Día 10/15/20) — no usado activamente
  -- hoy más que como referencia de "cuándo se preparó este intento".
  scheduled_for timestamptz,

  first_attempted_at timestamptz,
  sent_at timestamptz,

  -- Mensaje de error saneado (ej. el `message`/`type` que ya devuelve
  -- mailer.js), nunca la respuesta cruda del proveedor, nunca secrets.
  last_error_safe text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint raffle_fulfillment_communications_unique_intent
    unique (case_id, communication_type, recipient_role)
);

create index if not exists raffle_fulfillment_communications_case_idx
  on public.raffle_fulfillment_communications (case_id, communication_type);

create trigger trg_raffle_fulfillment_communications_updated
  before update on public.raffle_fulfillment_communications
  for each row execute function public.set_updated_at();

-- RLS default-deny total — mismo criterio exacto que
-- raffle_fulfillment_cases/raffle_fulfillment_events (CUMPLIMIENTO-1):
-- cero políticas, todo acceso vía service_role desde código server-side.
-- El ganador invitado NUNCA lee esta tabla directamente — su vista
-- pasa por /api/cumplimiento/caso/[token], que solo expone campos del
-- caso, nunca el ledger de comunicaciones.
alter table public.raffle_fulfillment_communications enable row level security;
revoke all on public.raffle_fulfillment_communications from public, anon, authenticated;

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   drop trigger if exists trg_raffle_fulfillment_communications_updated on public.raffle_fulfillment_communications;
--   drop table if exists public.raffle_fulfillment_communications;
--   drop index if exists raffle_fulfillment_cases_winner_token_hash_key;
--   alter table public.raffle_fulfillment_cases drop column if exists winner_access_token_created_at;
--   alter table public.raffle_fulfillment_cases drop column if exists winner_access_token_hash;
-- Reversible sin pérdida de datos fuera de estos campos/tabla nuevos —
-- no toca raffles, raffle_results, purchases, Trust, Events, Colectas
-- ni Payment Engine. Nota: si ya existen filas en
-- raffle_fulfillment_communications, la tabla en sí queda protegida
-- por las mismas garantías append-only-adjacentes que
-- raffle_fulfillment_events? NO — esta tabla NO es append-only (los
-- reintentos actualizan status/attempt_count in-place por diseño,
-- sección 6 del mandato) — a diferencia de raffle_fulfillment_events,
-- si algún día se requiere revertir esta migración con filas reales,
-- SÍ se puede hacer DROP TABLE directamente, sin trigger que lo bloquee.
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Rifas, DRAW, Trust, Events,
-- Colectas ni pagos:
--   - Una tabla enteramente nueva + dos columnas nuevas nullable en una
--     tabla que ya era exclusiva de Cumplimiento — ninguna tabla
--     existente fuera del dominio de Cumplimiento es tocada.
--   - No modifica ninguna función, política ni grant ya existente.
--   - drawWinner()/notifyWinnerDrawn()/ensureFulfillmentCaseForRaffle
--     no requieren cambios de schema para esta fase — ver
--     docs/cumplimiento/CUMPLIMIENTO_3_COMMUNICATIONS.md para el punto
--     de integración real (código, no schema).
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia —
--     el gate de aplicación es exclusivamente rifex-dev.
-- =====================================================================
