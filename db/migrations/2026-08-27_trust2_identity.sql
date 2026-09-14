-- TRUST-2 — identidad básica declarada: RUN/RUT chileno sobre la misma
-- tabla trust_onboarding (TRUST-1). Migración LOCAL, versionada, NO
-- aplicada todavía — requiere autorización expresa de Rodrigo antes de
-- ejecutarse contra rifex-dev.
--
-- Por qué extender trust_onboarding en vez de crear una tabla nueva:
-- TRUST-1 ya captura legal_name/birth_date/phone/account_type en esta
-- misma fila, con RLS default-deny total (ver 2026-08-26e_trust1_
-- onboarding.sql). El RUT es el mismo tipo de dato — identidad básica
-- declarada de la MISMA persona, sobre la MISMA fila — así que agregar
-- columnas nuevas hereda automáticamente la misma protección RLS sin
-- ninguna política adicional que escribir ni auditar, y evita un JOIN
-- extra en cada gate. No se agregan columnas para age_verified/
-- identity_verified/phone_verified: TRUST-2 nunca las persiste (ver
-- src/lib/trustIdentityGate.js, getIdentityStatus) — se devuelven como
-- constantes `false` desde la aplicación, precisamente para que no
-- exista ninguna columna que un futuro error de código pudiera escribir
-- como "verificado" sin que exista todavía una verificación real.
-- TRUST-3+ agregará esas columnas cuando haya algo real que escribir en
-- ellas.

alter table public.trust_onboarding
  add column if not exists rut_normalized text,
  add column if not exists rut_declared_at timestamptz;

-- Forma canónica: 7-8 dígitos + 1 dígito verificador (0-9 o K). La
-- normalización (sin puntos/guion, K mayúscula) vive en
-- src/lib/trustIdentityPolicy.js (normalizeRut) — este CHECK es defensa
-- en profundidad a nivel de base, no reemplaza esa validación real.
alter table public.trust_onboarding
  add constraint trust_onboarding_rut_normalized_format check (
    rut_normalized is null or rut_normalized ~ '^[0-9]{7,8}[0-9K]$'
  );

-- Evita que dos cuentas distintas declaren el mismo RUT. Parcial (solo
-- sobre valores no nulos) para no afectar usuarios sin RUT declarado
-- (todo el mundo antes de esta migración, y cualquier cuenta de un país
-- donde el RUT no aplica). El conflicto se resuelve en
-- upsertIdentityRut() como 'rut_conflict', sin revelar a quién
-- pertenece el RUT ya declarado.
create unique index if not exists trust_onboarding_rut_normalized_unique
  on public.trust_onboarding (rut_normalized)
  where rut_normalized is not null;

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   drop index if exists trust_onboarding_rut_normalized_unique;
--   alter table public.trust_onboarding drop constraint if exists trust_onboarding_rut_normalized_format;
--   alter table public.trust_onboarding drop column if exists rut_declared_at;
--   alter table public.trust_onboarding drop column if exists rut_normalized;
-- Reversible sin pérdida de datos fuera de estas dos columnas nuevas —
-- no toca legal_name/birth_date/phone/account_type/onboarding_completed_at
-- (TRUST-1), ni ninguna otra tabla.
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Eventos, pagos, usuarios antiguos ni
-- PROD:
--   - Solo agrega dos columnas nullable + un CHECK que las ignora
--     cuando son null + un índice parcial — ninguna fila existente de
--     trust_onboarding deja de cumplir sus constraints actuales.
--   - No modifica RLS, grants, triggers ni políticas ya existentes de
--     trust_onboarding (sigue exactamente igual: default-deny total,
--     ver la migración TRUST-1) — las columnas nuevas heredan esa misma
--     protección sin trabajo adicional.
--   - No modifica users_profile, events, raffles, colectas, ni ninguna
--     tabla de pagos — solo LEE users_profile.country_code (sin
--     modificarla) desde trustIdentityGate.js para decidir si el RUT es
--     obligatorio.
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia
--     (prohibido explícitamente) — el gate de aplicación es
--     exclusivamente rifex-dev, y solo con autorización expresa.
-- =====================================================================
