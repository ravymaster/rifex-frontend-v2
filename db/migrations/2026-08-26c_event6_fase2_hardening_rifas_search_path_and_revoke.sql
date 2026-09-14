-- EVENT-6 Fase 2 — endurecimiento de las 5 RPCs de Rifas restantes del
-- Security Advisor (search_path mutable). Ninguna es SECURITY DEFINER
-- (confirmado: prosecdef=false en las 5) — el riesgo real de escalamiento
-- vía search_path es bajo, igual que las RPCs de Eventos ya corregidas en
-- EVENT-6 Fase 1 (2026-08-26_event6_hardening_search_path_and_revoke.sql).
-- Se fija de todas formas como endurecimiento estándar.
alter function public.rate_limit_hit(text, timestamptz) set search_path = public;
alter function public.create_raffle_with_declarations(jsonb, uuid, text[], text) set search_path = public;
alter function public.extend_raffle_draw(uuid, uuid, timestamptz, timestamptz, text) set search_path = public;
alter function public.reserve_tickets_for_purchase(uuid, integer[], uuid, timestamptz) set search_path = public;
alter function public.converge_purchase_tickets_sold(uuid) set search_path = public;

-- =====================================================================
-- create_raffle_with_declarations / extend_raffle_draw tenían EXECUTE
-- otorgado a PUBLIC (heredado por anon/authenticated) además de a los
-- dos roles explícitamente. Ambas son SECURITY INVOKER y confían en el
-- parámetro `p_user_id` sin verificarlo contra auth.uid() dentro de la
-- función — PERO probado en vivo antes de este fix que esto NO era
-- explotable: al ser INVOKER, el SELECT/INSERT/UPDATE interno de la
-- función corre bajo RLS con el rol/identidad REAL de quien llama
-- (auth.uid() real, nunca falsificable desde el cliente), y las
-- políticas reales de `raffles` (raffles_select_own/raffles_insert_own/
-- raffles_update_own) exigen creator_id = auth.uid() — no el parámetro.
-- Un atacante autenticado real, llamando ambas RPCs directo por REST con
-- el uuid real de una víctima como p_user_id, fue rechazado: extend
-- devolvió raffle_not_found (0 filas visibles bajo RLS con su propia
-- identidad), create devolvió 42501 (RLS violation en el INSERT).
-- Evidencia completa: docs/events/EVENT6_SECURITY_AUDIT_FASE2.md.
--
-- El revoke de acá es endurecimiento por consistencia (la app real las
-- llama únicamente desde rutas API server-side con service_role — ver
-- src/pages/api/rifas/index.js, src/pages/api/rifas/[id]/extend.js —
-- nunca desde el cliente), no la corrección de un exploit activo.
-- reserve_tickets_for_purchase/converge_purchase_tickets_sold/
-- rate_limit_hit ya no tenían ningún grant a anon/authenticated/PUBLIC
-- (confirmado, sin cambios necesarios ahí).
revoke execute on function public.create_raffle_with_declarations(jsonb, uuid, text[], text) from public, anon, authenticated;
revoke execute on function public.extend_raffle_draw(uuid, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
