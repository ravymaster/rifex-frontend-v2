-- db/migrations/2026-11-13c_clp_whole_pesos_checks.sql
-- Montos CLP configurados por usuarios en pesos completos: las columnas
-- *_cents deben ser múltiplos exactos de 100. ADITIVA:
-- - solo los campos que ingresa una persona (precio de entrada, meta de
--   campaña, monto del aporte);
-- - no toca cálculos internos (subtotales, comisiones) ni importes externos;
-- - no modifica ni borra filas; si una fila no cumpliera, la migración falla
--   completa y no aplica nada (se audita antes con db/checks).
-- Rollback: db/rollback/2026-11-13c_clp_whole_pesos_checks_rollback.sql

alter table public.event_ticket_types
  add constraint event_ticket_types_price_whole_pesos
    check (price_cents % 100 = 0);

alter table public.colectas
  add constraint colectas_goal_whole_pesos
    check (goal_cents is null or goal_cents % 100 = 0);

alter table public.colecta_contributions
  add constraint colecta_contributions_amount_whole_pesos
    check (amount_cents % 100 = 0);
