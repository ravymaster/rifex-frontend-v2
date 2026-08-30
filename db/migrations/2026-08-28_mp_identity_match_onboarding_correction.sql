-- Corrección canónica hacia adelante (2026-08-28) — decisión de
-- Rodrigo: Mercado Pago pasa a ser el control principal que cierra el
-- onboarding de un creador (comprobando, cuando la API lo permita, que
-- el RUT declarado en Rifex coincide con el titular de la cuenta
-- Mercado Pago receptora). Simplifica además el onboarding: elimina
-- fecha de nacimiento (reemplazada por una declaración booleana
-- versionada) y el selector account_type (reemplazado por dos campos
-- de nombre, de los cuales exactamente uno debe estar lleno).
--
-- Migración ADITIVA/CORRECTIVA hacia adelante — NO revierte TRUST-1,
-- TRUST-2 ni TRUST-3A. Las tablas/columnas de esas migraciones
-- (trust_onboarding, trust_identity_verifications,
-- trust_identity_documents, trust_identity_audit_log, identity_verified/
-- age_verified) siguen existiendo intactas; esta migración solo agrega
-- columnas nuevas y elimina dos columnas de trust_onboarding
-- confirmadas vacías en rifex-dev antes de aplicar esto (verificado con
-- una consulta real, 0 filas totales en trust_onboarding en el momento
-- de escribir esta migración — no hay dato real que perder).
--
-- =====================================================================
-- 1) trust_onboarding — nuevos campos de identidad del creador
-- =====================================================================
alter table public.trust_onboarding
  add column if not exists person_name text,
  add column if not exists organization_name text;

-- account_type ya existía (TRUST-1) — sigue existiendo, pero deja de
-- ser un valor que el cliente elige: de acá en adelante SOLO
-- src/lib/trustOnboardingGate.js lo escribe, derivado de cuál de los
-- dos campos de arriba está lleno (ver deriveAccountType en
-- trustOnboardingPolicy.js). No se toca la columna ni su CHECK
-- existente — solo cambia quién y cómo la escribe.

alter table public.trust_onboarding
  add constraint trust_onboarding_exactly_one_name check (
    (person_name is not null and person_name <> '' and (organization_name is null or organization_name = ''))
    or (organization_name is not null and organization_name <> '' and (person_name is null or person_name = ''))
    or (person_name is null and organization_name is null)
    or (person_name = '' and organization_name = '')
  );

-- =====================================================================
-- 2) trust_onboarding — declaración de mayoría de edad, versionada.
--    Reemplaza por completo birth_date: nunca una fecha, nunca una
--    edad calculada, nunca presentado como age_verified.
-- =====================================================================
alter table public.trust_onboarding
  add column if not exists adult_declared boolean not null default false,
  add column if not exists adult_declared_at timestamptz,
  add column if not exists adult_declaration_version text;

alter table public.trust_onboarding
  add constraint trust_onboarding_adult_declaration_consistency check (
    adult_declared = false or (adult_declared_at is not null and adult_declaration_version is not null)
  );

-- =====================================================================
-- 3) Eliminación segura de birth_date/legal_name — confirmado 0 filas
--    con datos reales en rifex-dev antes de aplicar esta migración
--    (select count(*), count(birth_date), count(legal_name) — los tres
--    en 0 al momento de escribir esto). Ningún dato real se pierde.
--    Las constraints/índices que dependían de birth_date (TRUST-1) se
--    eliminan primero.
-- =====================================================================
alter table public.trust_onboarding drop constraint if exists trust_onboarding_birth_date_reasonable;
alter table public.trust_onboarding drop column if exists birth_date;
alter table public.trust_onboarding drop column if exists legal_name;

-- El CHECK de completitud original (TRUST-1) referenciaba legal_name y
-- birth_date directamente — se reemplaza por uno equivalente sobre los
-- campos nuevos, misma función (defensa en profundidad a nivel de
-- base, complementa la validación real en trustOnboardingPolicy.js,
-- nunca la sustituye).
alter table public.trust_onboarding drop constraint if exists trust_onboarding_complete_requires_fields;
alter table public.trust_onboarding
  add constraint trust_onboarding_complete_requires_fields check (
    onboarding_completed_at is null or (
      ((person_name is not null and person_name <> '') or (organization_name is not null and organization_name <> '')) and
      adult_declared = true and adult_declaration_version is not null and
      phone is not null and phone <> '' and
      terms_version is not null and terms_accepted_at is not null and
      privacy_version is not null and privacy_accepted_at is not null
    )
  );

-- =====================================================================
-- 4) merchant_gateways — resultado de la coincidencia de identidad con
--    Mercado Pago. NUNCA una segunda copia del RUT de MP — solo el
--    resultado de la comparación.
-- =====================================================================
alter table public.merchant_gateways
  add column if not exists mp_identity_match text,
  add column if not exists mp_identity_matched_at timestamptz,
  add column if not exists mp_identity_match_reason text,
  add column if not exists mp_match_rule_version text;

alter table public.merchant_gateways
  add constraint merchant_gateways_mp_identity_match_check check (
    mp_identity_match is null or mp_identity_match in (
      'not_connected', 'checking', 'matched', 'mismatch', 'unavailable', 'needs_review', 'disconnected'
    )
  );

-- Restricción real (Fase 5, punto 6): un mismo mp_user_id no puede
-- quedar activamente vinculado (revoked_at is null) a más de una
-- cuenta Rifex a la vez. Parcial — no afecta filas ya revocadas ni
-- filas sin mp_user_id.
create unique index if not exists merchant_gateways_mp_user_id_active_unique
  on public.merchant_gateways (provider, mp_user_id)
  where mp_user_id is not null and revoked_at is null;

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   drop index if exists merchant_gateways_mp_user_id_active_unique;
--   alter table public.merchant_gateways drop constraint if exists merchant_gateways_mp_identity_match_check;
--   alter table public.merchant_gateways drop column if exists mp_match_rule_version;
--   alter table public.merchant_gateways drop column if exists mp_identity_match_reason;
--   alter table public.merchant_gateways drop column if exists mp_identity_matched_at;
--   alter table public.merchant_gateways drop column if exists mp_identity_match;
--   alter table public.trust_onboarding drop constraint if exists trust_onboarding_complete_requires_fields;
--   -- (recrear el CHECK original de TRUST-1 requeriría restaurar legal_name/birth_date primero — no reversible sin pérdida si ya hay datos reales en los campos nuevos)
--   alter table public.trust_onboarding drop constraint if exists trust_onboarding_adult_declaration_consistency;
--   alter table public.trust_onboarding drop column if exists adult_declaration_version;
--   alter table public.trust_onboarding drop column if exists adult_declared_at;
--   alter table public.trust_onboarding drop column if exists adult_declared;
--   alter table public.trust_onboarding drop constraint if exists trust_onboarding_exactly_one_name;
--   alter table public.trust_onboarding drop column if exists organization_name;
--   alter table public.trust_onboarding drop column if exists person_name;
-- NOTA: birth_date/legal_name NO se restauran automáticamente — esta
-- migración los elimina de forma permanente porque se confirmó que
-- rifex-dev no tenía datos reales en ellos al momento de aplicarla.
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Eventos, pagos, ni PROD:
--   - trust_onboarding: 0 filas reales en rifex-dev al momento de
--     aplicar esta migración (verificado) — ningún usuario real pierde
--     datos. Los CHECK nuevos son equivalentes en severidad a los que
--     reemplazan, no más laxos.
--   - merchant_gateways: solo agrega columnas nullable + un CHECK que
--     las ignora cuando son null + un índice único parcial que no
--     afecta ninguna fila con mp_user_id null o ya revocada (todas las
--     filas reales existentes hoy, si las hay, no tenían coincidencia
--     de identidad calculada antes de esta migración).
--   - No modifica RLS ni grants de ninguna tabla — ambas ya tenían RLS
--     habilitado y políticas owner-only (merchant_gateways) o
--     default-deny total (trust_onboarding) antes de esta migración.
--   - assertCreatorEligible sigue exigiendo lo mismo que antes MÁS la
--     coincidencia de Mercado Pago — esto SÍ es un cambio de
--     comportamiento real para creadores nuevos (mandato explícito de
--     esta misión), pero no afecta Eventos/Rifas/Colectas YA
--     publicadas ni pagos ya procesados, solo la creación de
--     iniciativas NUEVAS desde este deploy en adelante.
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia —
--     el gate de aplicación es exclusivamente rifex-dev.
-- =====================================================================
