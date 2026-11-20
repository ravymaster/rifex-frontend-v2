-- db/migrations/2026-11-08b_raffles_close_direct_access.sql
-- Cierre del acceso directo de los roles de cliente a las tablas de Rifas.
-- Toda lectura pública pasa por las APIs de Rifex, que aplican la lista
-- cerrada de campos y la exposición pública (on / gated / off); las
-- escrituras ya pasaban por las APIs del servidor.
--
-- Aplicar DESPUÉS de desplegar el código que ya no consulta estas tablas
-- desde el navegador (ficha, checkout y chat por API).
--
-- Roles `anon` y `authenticated`: sin privilegios (lectura ni escritura)
-- sobre raffles, tickets, raffle_messages, raffle_results, las tablas
-- heredadas rifas y rifa_tickets, y las vistas raffles_compat y
-- tickets_compat. Revocar un privilegio de tabla revoca también los
-- privilegios por columna. `service_role` y los procesos del servidor
-- (pagos, webhooks, conciliación, scheduler y sorteo) no cambian. Las
-- políticas RLS se conservan sin cambios.
--
-- Idempotente. Reversión:
-- db/rollback/2026-11-08b_raffles_close_direct_access_rollback.sql.
-- Verificación: db/checks/2026-11-08b_raffles_close_direct_access_check.sql.

begin;

revoke all on table
  public.raffles,
  public.tickets,
  public.raffle_messages,
  public.raffle_results,
  public.rifas,
  public.rifa_tickets,
  public.raffles_compat,
  public.tickets_compat
from anon, authenticated;

commit;
