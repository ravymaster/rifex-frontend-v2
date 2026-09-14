-- TRUST-3A — verificación documental manual de identidad (solo personas
-- naturales, solo cédula chilena, solo revisión humana — sin OCR, sin
-- biometría, sin organizaciones). Migración LOCAL, versionada, aplicada
-- exclusivamente en rifex-dev bajo la misma autorización de esta misión.
--
-- Alcance deliberadamente NO cubierto acá (ver mandato de la misión):
--   - Organizaciones / RUT tributario / representantes -> TRUST-4.
--   - OCR/KYC automatizado, biometría, liveness, face match -> nunca en
--     TRUST-3A, evaluados (y probablemente rechazados) en fases futuras.
--   - Activación productiva de "identidad verificada obligatoria para
--     publicar" -> esta migración NO cambia esa política. Ver
--     src/lib/trustIdentityVerificationPolicy.js,
--     isIdentityVerificationRequiredForCreators() (constante `false`).

-- =====================================================================
-- 1) Bucket privado de Storage — nunca público, nunca URLs públicas.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('trust-documents', 'trust-documents', false)
on conflict (id) do nothing;

-- Deliberadamente NO se agrega ninguna policy de storage.objects para
-- este bucket: storage.objects ya tiene RLS habilitado por defecto en
-- Supabase, y sin ninguna policy que mencione bucket_id='trust-documents'
-- el acceso queda denegado por defecto para anon/authenticated — mismo
-- criterio "default-deny total" que las tablas de TRUST-1/TRUST-2. Toda
-- lectura/escritura real pasa por rutas API server-side con service_role
-- (que ignora RLS), nunca por el cliente directo contra Storage.

-- =====================================================================
-- 2) Caso de verificación — uno por usuario (no hay "múltiples intentos
--    en paralelo"; correction_required reutiliza el mismo caso, rejected
--    es terminal para esta fase — ver
--    src/lib/trustIdentityVerificationPolicy.js para la máquina de
--    estados completa).
-- =====================================================================
create table if not exists public.trust_identity_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,

  country_code text,
  verification_type text not null default 'person_document'
    check (verification_type in ('person_document')),

  status text not null default 'not_started'
    check (status in (
      'not_started', 'draft', 'submitted', 'under_review',
      'correction_required', 'approved', 'rejected', 'expired', 'revoked'
    )),

  reason_code text,
  policy_version text,

  reviewer_id uuid references auth.users(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Defensa en profundidad: un estado "revisado" siempre debe traer
  -- reviewer_id + reviewed_at juntos, nunca uno sin el otro.
  constraint trust_identity_verifications_review_consistency check (
    (status in ('approved', 'rejected', 'correction_required'))
      = (reviewer_id is not null and reviewed_at is not null)
    or status in ('not_started', 'draft', 'submitted', 'under_review', 'expired', 'revoked')
  )
);

create trigger trg_trust_identity_verifications_updated
  before update on public.trust_identity_verifications
  for each row execute function public.set_updated_at();

create index if not exists trust_identity_verifications_queue_idx
  on public.trust_identity_verifications (submitted_at)
  where status in ('submitted', 'under_review');

alter table public.trust_identity_verifications enable row level security;
revoke all on public.trust_identity_verifications from public, anon, authenticated;

-- =====================================================================
-- 3) Evidencia documental — nunca se sobreescribe una fila existente:
--    reemplazar un lado antes de enviar crea una fila nueva y marca la
--    anterior 'superseded' (rastro completo preservado).
-- =====================================================================
create table if not exists public.trust_identity_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  document_type text not null default 'cedula_chilena'
    check (document_type in ('cedula_chilena')),
  side text not null check (side in ('front', 'back')),

  storage_bucket text not null default 'trust-documents',
  storage_key text not null unique,

  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  byte_size integer not null check (byte_size > 0),
  sha256_hash text not null,

  status text not null default 'uploaded'
    check (status in ('uploaded', 'superseded')),

  created_at timestamptz not null default now()
);

create index if not exists trust_identity_documents_user_idx
  on public.trust_identity_documents (user_id, side, status);
create index if not exists trust_identity_documents_hash_idx
  on public.trust_identity_documents (user_id, sha256_hash);

alter table public.trust_identity_documents enable row level security;
revoke all on public.trust_identity_documents from public, anon, authenticated;

-- =====================================================================
-- 4) Historial append-only. El trigger rechaza UPDATE/DELETE incluso
--    para quien conecte con privilegios elevados por error de código —
--    la única forma de "corregir" el historial es una fila nueva.
-- =====================================================================
create table if not exists public.trust_identity_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid,
  actor_role text not null check (actor_role in ('user', 'admin', 'system')),
  action text not null,
  from_status text,
  to_status text,
  reason_code text,
  -- Nunca PII: sin RUT, sin nombre legal, sin fecha de nacimiento, sin
  -- storage_key completa, sin URL firmada, sin contenido del documento.
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trust_identity_audit_log_user_idx
  on public.trust_identity_audit_log (user_id, created_at);

alter table public.trust_identity_audit_log enable row level security;
revoke all on public.trust_identity_audit_log from public, anon, authenticated;

create function public.trust_identity_audit_log_immutable()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
begin
  raise exception 'trust_identity_audit_log es append-only: % no permitido', tg_op;
end;
$$;

create trigger trg_trust_identity_audit_log_no_update
  before update on public.trust_identity_audit_log
  for each row execute function public.trust_identity_audit_log_immutable();

create trigger trg_trust_identity_audit_log_no_delete
  before delete on public.trust_identity_audit_log
  for each row execute function public.trust_identity_audit_log_immutable();

-- =====================================================================
-- 5) Efectos autoritativos en trust_onboarding (TRUST-1/TRUST-2) — estas
--    columnas NO existían antes: TRUST-2 las devolvía como constantes
--    `false` desde la aplicación precisamente para que nada pudiera
--    escribirlas todavía. TRUST-3A es la primera fase con una
--    verificación real detrás, así que ahora sí se persisten — pero
--    SOLO la transición administrativa de aprobación
--    (src/lib/trustIdentityVerificationGate.js) las escribe; el usuario
--    nunca puede tocarlas (misma tabla, mismo RLS default-deny total ya
--    certificado en TRUST-1).
-- =====================================================================
alter table public.trust_onboarding
  add column if not exists identity_verified boolean not null default false,
  add column if not exists age_verified boolean not null default false,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verified_method text,
  add column if not exists identity_verified_by uuid references auth.users(id),
  add column if not exists identity_verification_expires_at timestamptz;

alter table public.trust_onboarding
  add constraint trust_onboarding_identity_verified_method_check check (
    identity_verified_method is null or identity_verified_method in ('manual_document_review')
  );

alter table public.trust_onboarding
  add constraint trust_onboarding_identity_verified_consistency check (
    identity_verified = false or (identity_verified_at is not null and identity_verified_method is not null and identity_verified_by is not null)
  );

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   drop trigger if exists trg_trust_identity_audit_log_no_delete on public.trust_identity_audit_log;
--   drop trigger if exists trg_trust_identity_audit_log_no_update on public.trust_identity_audit_log;
--   drop function if exists public.trust_identity_audit_log_immutable();
--   drop table if exists public.trust_identity_audit_log;
--   drop table if exists public.trust_identity_documents;
--   drop trigger if exists trg_trust_identity_verifications_updated on public.trust_identity_verifications;
--   drop table if exists public.trust_identity_verifications;
--   alter table public.trust_onboarding drop constraint if exists trust_onboarding_identity_verified_consistency;
--   alter table public.trust_onboarding drop constraint if exists trust_onboarding_identity_verified_method_check;
--   alter table public.trust_onboarding drop column if exists identity_verification_expires_at;
--   alter table public.trust_onboarding drop column if exists identity_verified_by;
--   alter table public.trust_onboarding drop column if exists identity_verified_method;
--   alter table public.trust_onboarding drop column if exists identity_verified_at;
--   alter table public.trust_onboarding drop column if exists age_verified;
--   alter table public.trust_onboarding drop column if exists identity_verified;
--   delete from storage.objects where bucket_id = 'trust-documents';
--   delete from storage.buckets where id = 'trust-documents';
-- Reversible sin afectar Eventos, pagos, ni las columnas TRUST-1/TRUST-2
-- ya certificadas de trust_onboarding (solo se agregan columnas nuevas).
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Eventos, pagos, usuarios antiguos ni
-- PROD:
--   - Tres tablas enteramente nuevas + un bucket nuevo, sin FK entrante
--     desde ninguna tabla existente de Eventos/Rifas/Colectas/pagos.
--   - Las columnas nuevas en trust_onboarding son nullable o con default
--     `false` — ninguna fila existente deja de cumplir sus constraints.
--   - No modifica RLS, grants, triggers ni políticas ya existentes de
--     trust_onboarding — las columnas nuevas heredan la misma protección.
--   - assertCreatorEligible (TRUST-2) NO cambia de comportamiento por
--     esta migración: isIdentityVerificationRequiredForCreators() sigue
--     en `false`, así que crear/publicar/recaudar sigue exigiendo
--     exactamente lo mismo que en TRUST-2 (onboarding + 18+ declarado +
--     RUT para Chile) — nada se bloquea de más para nadie todavía.
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia
--     (prohibido explícitamente) — el gate de aplicación es
--     exclusivamente rifex-dev, y solo con autorización expresa.
-- =====================================================================
