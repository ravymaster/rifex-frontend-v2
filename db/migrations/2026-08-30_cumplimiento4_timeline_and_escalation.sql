-- CUMPLIMIENTO-4 — respuestas, Día 10/15/20, escalamiento interno.
-- Migración LOCAL, versionada, aplicada únicamente a rifex-dev — NO a
-- PROD. Puramente aditiva sobre raffle_fulfillment_cases (ya exclusiva
-- de Cumplimiento) — no toca Rifas, DRAW, Trust, Events, Colectas ni
-- Payment Engine. No se crea ninguna tabla nueva: CUMPLIMIENTO-1/2/3 ya
-- dejaron estructura suficiente (raffle_fulfillment_events para
-- historia append-only, raffle_fulfillment_communications para el
-- ledger de comunicaciones con los 9 tipos ya preparados desde
-- CUMPLIMIENTO-3, incluidos los de Día 10/15/20).

-- =====================================================================
-- closed_at / escalated_at / escalation_reason — necesarias como guarda
-- de idempotencia real para el cierre automático de Día 20: `status`
-- por sí solo NO sirve como guarda, porque un caso puede llegar
-- "naturalmente" a un status similar (ej. delivery_pending) por
-- evaluación normal antes de que el cierre automático se haya
-- ejecutado. closed_at IS NOT NULL es la única señal confiable de "el
-- proceso de cierre de Día 20 ya corrió para este caso" — sin ella,
-- un reintento del scheduler no tendría forma segura de saber si ya
-- cerró, y podría reenviar el expediente interno o el aviso de revisión
-- más de una vez.
-- =====================================================================

alter table public.raffle_fulfillment_cases
  add column if not exists closed_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_reason text
    check (escalation_reason is null or escalation_reason in (
      'winner_denied_receipt',
      'winner_no_response'
    ));

create index if not exists raffle_fulfillment_cases_closed_idx
  on public.raffle_fulfillment_cases (closed_at)
  where closed_at is null;

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   drop index if exists raffle_fulfillment_cases_closed_idx;
--   alter table public.raffle_fulfillment_cases drop column if exists escalation_reason;
--   alter table public.raffle_fulfillment_cases drop column if exists escalated_at;
--   alter table public.raffle_fulfillment_cases drop column if exists closed_at;
-- Reversible sin pérdida de datos fuera de estas 3 columnas nuevas —
-- no toca ninguna tabla fuera del dominio de Cumplimiento.
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Rifas, DRAW, Trust, Events,
-- Colectas ni pagos:
--   - 3 columnas nullable en una tabla que ya era exclusiva de
--     Cumplimiento — ninguna tabla existente fuera de este dominio es
--     tocada.
--   - No modifica ninguna función, política ni grant ya existente. RLS
--     default-deny total de raffle_fulfillment_cases (CUMPLIMIENTO-1)
--     cubre estas columnas nuevas automáticamente, sin cambios
--     adicionales.
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia —
--     el gate de aplicación es exclusivamente rifex-dev.
-- =====================================================================
