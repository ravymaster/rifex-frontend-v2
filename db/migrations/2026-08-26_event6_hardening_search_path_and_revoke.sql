-- EVENT-6 Fase 1 — auditoría autónoma de EVENT-1..5 en rifex-dev.
-- Dos hallazgos reales del Security Advisor / inspección directa de
-- grants, ninguno explotable hoy (verificado en vivo antes de escribir
-- esta migración — ver docs/events/EVENT6_SECURITY_AUDIT.md), ambos
-- corregidos como defensa en profundidad real, consistente con el patrón
-- ya establecido en PRE-LAUNCH-FIX-1/2/3.
--
-- =====================================================================
-- 1. search_path mutable (Security Advisor, WARN, function_search_path_
--    mutable) en las 6 RPCs de EVENT-2/3/4. Ninguna es SECURITY DEFINER
--    (confirmado: security_type='INVOKER' en information_schema.routines
--    para las 6) — así que un search_path hostil no puede escalar
--    privilegios acá (a diferencia de find_user_id_by_email, que SÍ es
--    DEFINER y ya fija su search_path desde EVENT-4). Se fija de todas
--    formas, como endurecimiento estándar recomendado por Postgres,
--    metadata-only (ALTER FUNCTION, sin tocar el cuerpo/lógica real).
-- =====================================================================
alter function public.create_event_order(uuid, jsonb, text, text, numeric, integer) set search_path = public;
alter function public.expire_event_order(uuid, boolean) set search_path = public;
alter function public.mark_event_order_paid(uuid, text) set search_path = public;
alter function public.issue_event_order_tickets(uuid) set search_path = public;
alter function public.void_event_ticket(uuid) set search_path = public;
alter function public.check_in_event_ticket(text, uuid, uuid) set search_path = public;

-- =====================================================================
-- 2. public.events / public.event_ticket_types (EVENT-1) nunca
--    recibieron el `revoke` explícito de INSERT/UPDATE/DELETE que sí
--    tienen todas las tablas de Eventos creadas después (EVENT-2/3/4) —
--    una omisión de la migración original, no una decisión deliberada.
--    Verificado en vivo antes de este fix: un INSERT/UPDATE/DELETE anon
--    directo contra la fila real de un evento publicado ya devolvía 0
--    filas afectadas (policy RLS sin INSERT/UPDATE/DELETE = deny-by-
--    default) — no era explotable. Este revoke es un segundo cerrojo
--    real, no la corrección de un exploit activo.
--    SELECT se mantiene intacto a propósito: events_select_public /
--    event_ticket_types_select_public son políticas RLS reales que
--    exponen SOLO eventos published/tipos active — es la lectura
--    pública legítima del catálogo (`/eventos`, `/eventos/[id]`), nunca
--    debe revocarse.
-- =====================================================================
revoke insert, update, delete, truncate on public.events from anon, authenticated;
revoke insert, update, delete, truncate on public.event_ticket_types from anon, authenticated;
