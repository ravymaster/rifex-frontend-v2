-- db/rollback/2026-11-13c_clp_whole_pesos_checks_rollback.sql
-- Reversión selectiva de las restricciones de pesos completos. Solo elimina
-- las tres restricciones; no modifica ni borra datos.
alter table public.event_ticket_types drop constraint if exists event_ticket_types_price_whole_pesos;
alter table public.colectas drop constraint if exists colectas_goal_whole_pesos;
alter table public.colecta_contributions drop constraint if exists colecta_contributions_amount_whole_pesos;
