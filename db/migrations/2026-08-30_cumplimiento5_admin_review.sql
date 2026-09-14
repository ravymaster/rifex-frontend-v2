-- CUMPLIMIENTO-5 — mesa de revisión administrativa dentro de /admin.
-- Migración LOCAL, versionada, aplicada únicamente a rifex-dev — NO a
-- PROD. Puramente aditiva: 3 columnas nullable en
-- raffle_fulfillment_cases. NO se crea ninguna tabla nueva.
--
-- Auditoría previa (obligatoria antes de diseñar esto): CUMPLIMIENTO-1
-- ya dejó raffle_fulfillment_events como historial append-only genérico
-- -- su columna actor_type YA incluye 'admin' en su CHECK constraint
-- desde el día uno (2026-08-30_cumplimiento1_foundation.sql línea 139),
-- y event_type es texto libre sin CHECK. Esto significa que iniciar una
-- revisión, agregar una nota interna, y resolver una revisión NO
-- necesitan una tabla nueva -- son simplemente nuevos event_type sobre
-- la MISMA tabla ya protegida por el trigger de inmutabilidad
-- (raffle_fulfillment_events_immutable(): rechaza UPDATE/DELETE
-- incondicionalmente). Reutilizar esto en vez de crear
-- raffle_fulfillment_admin_notes es la aplicación directa del mandato:
-- "no crear tablas innecesarias" + "no sacrificar trazabilidad".
--
-- Lo único que SÍ necesita persistencia nueva es un resumen mutable de
-- "en qué estado quedó la revisión ahora mismo" -- para que el listado
-- /admin/cumplimiento pueda filtrar/contar sin tener que reconstruir el
-- historial completo de eventos en cada request. Mismo patrón EXACTO ya
-- usado por creator_response/winner_response en CUMPLIMIENTO-1: columna
-- mutable de lectura rápida, respaldada por el log append-only.

alter table public.raffle_fulfillment_cases
  add column if not exists admin_review_status text
    check (admin_review_status is null or admin_review_status in (
      'in_review',
      'resolved',
      'closed_without_determination'
    )),
  add column if not exists admin_reviewed_by uuid,
  add column if not exists admin_reviewed_at timestamptz;

-- admin_review_status NULL == "todavía no se inició revisión" (lo que
-- el mandato llama conceptualmente "pending"). Se decidió NO agregar un
-- cuarto valor literal 'pending' redundante con NULL -- dos
-- representaciones de "no iniciado" (NULL y 'pending') podrían
-- desincronizarse con el tiempo; NULL ya es inequívoco y es el valor
-- por defecto natural de una columna recién agregada. La UI traduce
-- NULL a "Pendiente de revisión".
--
-- Deliberadamente SIN valores como 'fraud'/'scammer'/'guilty' -- el
-- sistema no determina delitos (mandato sección 8). 'resolved' vs
-- 'closed_without_determination' distingue "se llegó a una resolución
-- administrativa" de "se cerró sin poder determinar nada concluyente",
-- sin que ninguno de los dos implique una afirmación de fraude.

create index if not exists raffle_fulfillment_cases_admin_review_idx
  on public.raffle_fulfillment_cases (admin_review_status)
  where escalated_at is not null;

-- =====================================================================
-- Rollback (documentado, no ejecutado por esta migración):
--   drop index if exists raffle_fulfillment_cases_admin_review_idx;
--   alter table public.raffle_fulfillment_cases drop column if exists admin_reviewed_at;
--   alter table public.raffle_fulfillment_cases drop column if exists admin_reviewed_by;
--   alter table public.raffle_fulfillment_cases drop column if exists admin_review_status;
-- Reversible sin pérdida de datos fuera de estas 3 columnas nuevas.
-- Los eventos admin_review_started/admin_note_added/admin_review_resolved
-- ya escritos en raffle_fulfillment_events NO se pierden con este
-- rollback (esa tabla no se toca) -- solo se pierde el resumen mutable
-- de conveniencia, reconstruible desde el historial si alguna vez hace
-- falta.
-- =====================================================================

-- =====================================================================
-- Por qué esta migración no afecta Rifas, DRAW, Trust, Events, Colectas,
-- pagos, ni el resto de Cumplimiento:
--   - 3 columnas nullable en una tabla que ya era exclusiva de
--     Cumplimiento -- ninguna tabla existente fuera de este dominio es
--     tocada.
--   - No modifica ninguna función, política, grant, ni CHECK ya
--     existente. RLS default-deny total de raffle_fulfillment_cases
--     (CUMPLIMIENTO-1) cubre estas columnas nuevas automáticamente, sin
--     cambios adicionales -- ni siquiera un admin puede leer/escribir
--     esta tabla vía RLS; todo pasa por service_role desde rutas
--     server-side que primero verifican adminAuth.resolveAdmin(req).
--   - raffle_fulfillment_events no se modifica estructuralmente en
--     absoluto -- ni una columna, ni una política, ni el trigger de
--     inmutabilidad. Solo se agregan filas nuevas con valores de
--     event_type que ese esquema ya permitía desde el día uno.
--   - No se aplica a PROD por esta misión bajo ninguna circunstancia --
--     el gate de aplicación es exclusivamente rifex-dev.
-- =====================================================================
