-- EVENT-6 Fase 2 — cierre por consistencia (no corrige un exploit: ya
-- demostrado en vivo que estas 4 son inalcanzables vía RPC, ver
-- docs/events/EVENT6_SECURITY_AUDIT_FASE2.md). Las 4 son funciones
-- TRIGGER (RETURNS trigger) usadas por trg_raffles_set_creator,
-- trg_set_creator_fields y tr_set_bank_account_owner — nunca pensadas
-- para invocarse directamente. Revocar EXECUTE de anon/authenticated/
-- PUBLIC no afecta el disparo real de los triggers en absoluto: Postgres
-- invoca las funciones trigger internamente como parte del mecanismo de
-- disparo (con los privilegios del dueño, al ser SECURITY DEFINER), sin
-- pasar por el chequeo de EXECUTE que sí aplica a una llamada directa de
-- función. Cierra el hallazgo del Security Advisor sin cambiar ningún
-- comportamiento legítimo (crear una rifa o una cuenta bancaria real
-- sigue disparando el trigger exactamente igual).
revoke execute on function public.rifex_set_creator_defaults() from public, anon, authenticated;
revoke execute on function public.set_bank_account_owner() from public, anon, authenticated;
revoke execute on function public.set_creator_fields() from public, anon, authenticated;
revoke execute on function public.set_raffle_creator_from_jwt() from public, anon, authenticated;
