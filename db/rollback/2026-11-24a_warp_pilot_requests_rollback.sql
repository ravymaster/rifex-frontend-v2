-- db/rollback/2026-11-24a_warp_pilot_requests_rollback.sql
-- Revierte db/migrations/2026-11-24a_warp_pilot_requests.sql.
-- ATENCIÓN: borra las solicitudes de piloto guardadas. Antes de ejecutarlo,
-- confirmar con db/checks/2026-11-24a_warp_pilot_requests_check.sql cuántas
-- filas hay y si deben conservarse. No toca ninguna otra tabla.
drop table if exists public.warp_pilot_request_history;
drop table if exists public.warp_pilot_requests;
