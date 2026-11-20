-- TRUST-3A — corrige un defecto real de diseño encontrado al probar en
-- rifex-dev (limpieza de fixtures desechables): borrar CUALQUIER usuario
-- de auth.users fallaba con "Database error deleting user".
--
-- Causa raíz: trust_identity_audit_log.user_id tenía
-- "references auth.users(id) on delete cascade" — al borrar un usuario,
-- Postgres intenta un DELETE en cascada sobre sus filas de audit log,
-- pero el trigger de inmutabilidad (trg_trust_identity_audit_log_no_delete,
-- ver 2026-08-27b) rechaza CUALQUIER DELETE sin excepción, incluido ese
-- DELETE en cascada legítimo — la transacción completa de borrado de
-- usuario fallaba, para cualquier usuario que tuviera aunque sea una
-- fila de historial (es decir, prácticamente cualquiera que hubiera
-- tocado TRUST-3A).
--
-- Además, reviewer_id (trust_identity_verifications) e
-- identity_verified_by (trust_onboarding) referencian auth.users(id)
-- sin ON DELETE — por defecto NO ACTION/RESTRICT — así que borrar una
-- cuenta que alguna vez actuó como revisor/aprobador también habría
-- fallado apenas existiera algún caso con esa referencia.
--
-- Corrección, en dos partes:
--   1) trust_identity_audit_log.user_id ya NO referencia auth.users con
--      cascada — queda como uuid simple, sin FK. El historial de
--      auditoría sobrevive intencionalmente a la eliminación de la
--      cuenta (correcto para fines de auditoría/cumplimiento — un
--      registro de "qué pasó" no debería desaparecer solo porque la
--      cuenta se borró después). El trigger de inmutabilidad sigue
--      protegiendo contra UPDATE/DELETE directos desde código de
--      aplicación, que es su propósito real.
--   2) reviewer_id / identity_verified_by pasan a ON DELETE SET NULL:
--      borrar una cuenta que fue revisor/aprobador dispersa esa
--      referencia a null en vez de bloquear el borrado — el caso
--      revisado conserva su estado (approved/rejected/etc.), solo pierde
--      la referencia a un revisor que ya no existe.

alter table public.trust_identity_audit_log
  drop constraint if exists trust_identity_audit_log_user_id_fkey;

alter table public.trust_identity_verifications
  drop constraint if exists trust_identity_verifications_reviewer_id_fkey;
alter table public.trust_identity_verifications
  add constraint trust_identity_verifications_reviewer_id_fkey
    foreign key (reviewer_id) references auth.users(id) on delete set null;

alter table public.trust_onboarding
  drop constraint if exists trust_onboarding_identity_verified_by_fkey;
alter table public.trust_onboarding
  add constraint trust_onboarding_identity_verified_by_fkey
    foreign key (identity_verified_by) references auth.users(id) on delete set null;

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   alter table public.trust_onboarding drop constraint if exists trust_onboarding_identity_verified_by_fkey;
--   alter table public.trust_onboarding add constraint trust_onboarding_identity_verified_by_fkey foreign key (identity_verified_by) references auth.users(id);
--   alter table public.trust_identity_verifications drop constraint if exists trust_identity_verifications_reviewer_id_fkey;
--   alter table public.trust_identity_verifications add constraint trust_identity_verifications_reviewer_id_fkey foreign key (reviewer_id) references auth.users(id);
--   alter table public.trust_identity_audit_log add constraint trust_identity_audit_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
-- (el rollback reintroduce el defecto original — solo documentado por
-- completitud, no hay razón real para revertir esta corrección.)
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Eventos, pagos ni PROD:
--   - Solo cambia el comportamiento ON DELETE de tres foreign keys ya
--     existentes de TRUST-3A — no toca ninguna tabla de Eventos/Rifas/
--     Colectas/pagos, ni agrega/quita columnas, ni cambia RLS/grants.
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia —
--     el gate de aplicación es exclusivamente rifex-dev.
-- =====================================================================
