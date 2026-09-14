-- PRE-LAUNCH-FIX-2 — cierre de P1-NEW-2 (rate_limit_hits sin RLS) +
-- hardening de grants en las RPCs nuevas de PRE-LAUNCH-FIX-1. Migración
-- nueva, no se edita la migración histórica ya aplicada.

-- P1-NEW-2: rate_limit_hits nunca recibió ENABLE ROW LEVEL SECURITY (a
-- diferencia de legal_declarations, que sí la tiene desde el día uno).
-- Confirmado en PRE-LAUNCH-2: el cliente anon podía INSERT/UPDATE directo
-- sobre la tabla y llamar rate_limit_hit() directo — podía resetear su
-- propio contador (bypass total del limiter) o inflar el de otra IP/
-- user_id conocido (griefing/denegación de servicio dirigida). Sin
-- políticas: default-deny total para cualquier rol que no sea
-- service-role (que bypasea RLS de por sí) — igual criterio ya usado en
-- legal_declarations.
alter table public.rate_limit_hits enable row level security;

-- Defensa en profundidad: Postgres otorga EXECUTE a PUBLIC automáticamente
-- al crear una función si no se especifica lo contrario — la migración
-- original de PRE-LAUNCH-FIX-1 nunca lo revocó. RLS ya bloquea el daño
-- real, pero "la RPC es invocable por cualquiera" nunca debería ser cierto
-- para funciones que solo el propio backend de Rifex necesita llamar.
-- reserve_tickets_for_purchase y converge_purchase_tickets_sold ya
-- resultaron no explotables por anon en la auditoría (corren SECURITY
-- INVOKER, heredan el RLS de tickets/purchases que ya deniega escritura a
-- anon) — se revocan igual, por el mismo principio: no dejar una RPC
-- públicamente invocable solo porque otra capa la hace "menos peligrosa".
revoke execute on function public.rate_limit_hit(text, timestamptz) from public;
revoke execute on function public.rate_limit_hit(text, timestamptz) from anon;
revoke execute on function public.rate_limit_hit(text, timestamptz) from authenticated;
grant execute on function public.rate_limit_hit(text, timestamptz) to service_role;

revoke execute on function public.reserve_tickets_for_purchase(uuid, integer[], uuid, timestamptz) from public;
revoke execute on function public.reserve_tickets_for_purchase(uuid, integer[], uuid, timestamptz) from anon;
revoke execute on function public.reserve_tickets_for_purchase(uuid, integer[], uuid, timestamptz) from authenticated;
grant execute on function public.reserve_tickets_for_purchase(uuid, integer[], uuid, timestamptz) to service_role;

revoke execute on function public.converge_purchase_tickets_sold(uuid) from public;
revoke execute on function public.converge_purchase_tickets_sold(uuid) from anon;
revoke execute on function public.converge_purchase_tickets_sold(uuid) from authenticated;
grant execute on function public.converge_purchase_tickets_sold(uuid) to service_role;
