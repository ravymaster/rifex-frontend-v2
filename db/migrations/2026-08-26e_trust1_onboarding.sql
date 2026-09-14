-- TRUST-1 — onboarding universal obligatorio (Google OAuth y correo).
-- Migración LOCAL, versionada, NO aplicada todavía — requiere autorización
-- expresa de Rodrigo antes de ejecutarse contra rifex-dev (ver checkpoint
-- de esta misión).
--
-- Tabla nueva, independiente de `users_profile` (que ya tiene RLS de
-- escritura directa del cliente, `owner rw profile`/`profile_update_own`
-- — ver db/restore/001_schema_supabase_clean.sql). Deliberadamente NO se
-- agregan estas columnas a `users_profile`: si se agregaran ahí, el
-- cliente podría escribir `onboarding_completed_at` directamente vía
-- PostgREST usando esas mismas políticas ya existentes, violando el
-- invariante "el cliente no decide el estado autoritativo". `trust_
-- onboarding` en cambio sigue el mismo patrón ya certificado en
-- EVENT-2/3/4 (event_orders/event_tickets/event_staff): RLS default-deny
-- total, sin ninguna política de SELECT/INSERT/UPDATE/DELETE para
-- anon/authenticated — toda lectura y escritura pasa por rutas API
-- server-side con service_role (src/pages/api/onboarding/trust/*.js),
-- nunca por el cliente directamente.
--
-- `SECURITY INVOKER` no aplica aquí porque no se define ninguna función —
-- todas las escrituras son INSERT/UPDATE directos vía service_role desde
-- la API (mismo patrón que `POST /api/events`, que inserta directo en
-- `events` sin una RPC dedicada) — no hay una operación concurrente
-- crítica (como la emisión de tickets) que justifique un lock FOR UPDATE
-- ni una RPC PL/pgSQL propia para TRUST-1.

create table if not exists public.trust_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Datos privados iniciales (Fase 2 del mandato de diseño). Nunca
  -- expuestos en una API pública, nunca en el perfil público.
  legal_name text,
  birth_date date,
  phone text,
  account_type text not null default 'person'
    check (account_type in ('person', 'organization')),

  -- Aceptaciones versionadas — nunca solo un booleano. Constantes reales
  -- en src/lib/trustOnboardingPolicy.js (CURRENT_TERMS_VERSION/
  -- CURRENT_PRIVACY_VERSION), comparadas server-side en cada submit.
  terms_version text,
  terms_accepted_at timestamptz,
  privacy_version text,
  privacy_accepted_at timestamptz,

  -- Autoridad real de "onboarding completo". Nunca escribible
  -- directamente por el cliente — solo la API la calcula y la fija,
  -- nunca acepta este campo como parte del body de la request.
  onboarding_completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Defensa en profundidad a nivel de base de datos: aunque un error de
  -- programación en la API intentara marcar completado sin todos los
  -- campos, la base lo rechaza. No sustituye la validación real en
  -- trustOnboardingPolicy.js, la complementa.
  constraint trust_onboarding_complete_requires_fields check (
    onboarding_completed_at is null or (
      legal_name is not null and legal_name <> '' and
      birth_date is not null and
      phone is not null and phone <> '' and
      terms_version is not null and terms_accepted_at is not null and
      privacy_version is not null and privacy_accepted_at is not null
    )
  ),

  -- Fecha de nacimiento declarada: solo validación de forma/rango
  -- razonable (nunca futura, nunca implausible) — esto es "edad
  -- declarada", jamás "edad verificada" (ver TRUST_AGE_IDENTITY_
  -- VERIFICATION.md). La verificación real es TRUST-2+, fuera de
  -- alcance de esta migración.
  constraint trust_onboarding_birth_date_reasonable check (
    birth_date is null or (
      birth_date <= (now() at time zone 'utc')::date
      and birth_date >= ((now() at time zone 'utc')::date - interval '120 years')
    )
  )
);

create trigger trg_trust_onboarding_updated
  before update on public.trust_onboarding
  for each row execute function public.set_updated_at();

-- Índice parcial: resolución rápida de "quién ya completó" para
-- auditoría/soporte, sin escanear filas incompletas.
create index if not exists trust_onboarding_completed_idx
  on public.trust_onboarding (user_id)
  where onboarding_completed_at is not null;

-- =====================================================================
-- RLS default-deny total — mismo criterio que event_orders/event_tickets/
-- event_staff (EVENT-2/3/4) y legal_declarations/rate_limit_hits
-- (PRE-LAUNCH-FIX-1/2). Sin lectura pública, sin escritura pública, sin
-- excepción para el propio dueño de la fila: incluso el propio usuario
-- lee/escribe su estado de onboarding exclusivamente a través de
-- GET/POST /api/onboarding/trust/*, nunca por PostgREST directo — a
-- diferencia deliberada de users_profile/country_code, que sí permite
-- escritura directa del cliente por ser de mucho menor sensibilidad.
-- =====================================================================
alter table public.trust_onboarding enable row level security;
revoke all on public.trust_onboarding from public, anon, authenticated;

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   drop trigger if exists trg_trust_onboarding_updated on public.trust_onboarding;
--   drop table if exists public.trust_onboarding;
-- Reversible sin pérdida de datos fuera de esta tabla — no toca
-- users_profile, events, raffles, colectas, ni ninguna tabla de pagos.
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Eventos, pagos ni PROD:
--   - Tabla enteramente nueva, sin FK entrante desde ninguna tabla
--     existente (events/raffles/colectas/event_orders/purchases no
--     referencian trust_onboarding en absoluto en esta migración).
--   - No modifica ninguna tabla, función, política ni grant ya
--     existente — es puramente aditiva.
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia
--     (prohibido explícitamente) — el gate de aplicación es
--     exclusivamente rifex-dev, y solo con autorización expresa.
-- =====================================================================
