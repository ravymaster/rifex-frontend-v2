-- db/migrations/2026-09-12_dev_admin_door_v1.sql
-- PUERTA TEMPORAL DE ACCESO A /admin — EXCLUSIVA DE rifex-dev.
--
-- Herramienta de desarrollo, no una función de producto. Nunca aplicar
-- esta migración contra la base PROD. La autoridad de "quién es admin"
-- en PROD (user.app_metadata.role === 'admin', src/lib/adminAuth.js) no
-- cambia en absoluto — esta puerta es un mecanismo ADICIONAL, aislado,
-- que solo puede activarse cuando el runtime confirma (dos chequeos
-- independientes, ver src/lib/devAdminDoor.js) que corre en el proyecto
-- Vercel DEV (rifex-frontend-main), nunca en PROD (rifex-frontend-v2).
--
-- Diseño con estado (no un JWT firmado sin estado): "cerrar la puerta"
-- debe invalidar de inmediato cualquier sesión ya emitida, no solo dejar
-- de emitir nuevas — un cookie firmado sin estado no se puede revocar así.
-- Por eso hay una tabla de sesiones real, consultada en cada request.
--
-- dev_admin_access_tokens: enlaces de un solo uso ("abrir la puerta").
-- Nunca se guarda el token en texto plano — solo su hash (sha256).
create table if not exists public.dev_admin_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  -- Expiración corta: 30 minutos para canjear el enlace. Si nadie lo usa
  -- en ese plazo, queda inservible sin necesidad de "cerrar" nada.
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists dev_admin_access_tokens_hash_idx on public.dev_admin_access_tokens(token_hash);

-- dev_admin_sessions: la sesión real que queda activa tras canjear un
-- token. El id de esta fila ES el valor de la cookie — nunca un JWT
-- autocontenido, precisamente para que "cerrar la puerta" pueda revocar
-- una sesión ya en curso con un solo UPDATE.
create table if not exists public.dev_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  source_token_id uuid not null references public.dev_admin_access_tokens(id),
  created_at timestamptz not null default now(),
  -- Duración de la sesión ya canjeada: 4 horas — suficiente para una
  -- revisión completa del panel, corta si alguien más obtuviera la cookie.
  expires_at timestamptz not null default (now() + interval '4 hours'),
  revoked_at timestamptz
);
create index if not exists dev_admin_sessions_active_idx on public.dev_admin_sessions(id) where revoked_at is null;

-- dev_admin_access_audit: "Registrar cuándo se abre y cuándo se cierra"
-- (requisito explícito del mandato). Insert-only, nunca se edita.
create table if not exists public.dev_admin_access_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('opened', 'closed', 'redeemed', 'denied', 'expired_cleanup')),
  detail jsonb,
  created_at timestamptz not null default now()
);

-- RLS: mismo patrón que toda instrumentación sensible del proyecto —
-- revoke all de public/anon/authenticated. Las 3 tablas se leen/escriben
-- EXCLUSIVAMENTE con la service_role key, nunca desde el navegador ni
-- desde una sesión de usuario normal — ni siquiera un admin real de PROD
-- podría tocarlas por accidente vía la API pública.
alter table public.dev_admin_access_tokens enable row level security;
alter table public.dev_admin_sessions enable row level security;
alter table public.dev_admin_access_audit enable row level security;
revoke all on public.dev_admin_access_tokens from public, anon, authenticated;
revoke all on public.dev_admin_sessions from public, anon, authenticated;
revoke all on public.dev_admin_access_audit from public, anon, authenticated;
