-- EVENT-8: aforo explícito del evento (events.capacity) + invariante
-- capacidad<->cupos<->venta<->check-in. No crea tablas nuevas, no toca
-- event_orders/event_tickets/event_checkins/check_in_event_ticket (la RPC
-- de check-in de EVENT-4 queda intacta, nunca reimplementada). Dominio
-- propio, independiente de Cumplimiento/Onboarding/Bancos/Payment Engine.
--
-- Decisión de producto (auditoría previa a este archivo, confirmada en
-- rifex-dev: 0 eventos con ningún campo equivalente a "aforo" existente):
-- `capacity` es NULLABLE. Un evento histórico o uno nuevo sin aforo
-- definido queda con capacity=null — "sin aforo definido", nunca un valor
-- inventado (0 sería falso: "no vende nada"; un número arbitrario sería
-- una afirmación no verificada). La UI y las validaciones tratan null
-- explícitamente como "sin aforo definido", nunca como 0 ni como
-- ausencia de límite silenciosa — ver crear-evento.jsx y
-- panel/eventos/[id].jsx.

alter table public.events
  add column if not exists capacity integer;

alter table public.events
  drop constraint if exists events_capacity_positive;
alter table public.events
  add constraint events_capacity_positive check (capacity is null or capacity > 0);

-- =====================================================================
-- Invariante capacidad<->cupos: la suma de cupo "comprometido" de un
-- evento nunca puede superar events.capacity cuando este está definido.
-- "Comprometido" combina dos fuentes por tipo de entrada, a propósito:
--   - tipo ACTIVO (vendible ahora): cuenta su quantity_total completo —
--     es la regla literal del mandato ("SUM(cupo vendible) <= capacity"),
--     evita configurar más stock vendible del que el aforo permite.
--   - tipo OCULTO/otro estado: cuenta quantity_sold+quantity_reserved
--     (nunca su quantity_total) — cierra un caso real detectado en la
--     auditoría: un tipo ocultado DESPUÉS de vender entradas sigue
--     representando asistentes reales, y jamás debe poder "desaparecer"
--     del cálculo de aforo reduciendo capacity por debajo de lo ya
--     vendido en ese tipo.
-- Nunca se dispara en el camino caliente (create_event_order,
-- mark_event_order_paid, expire_event_order, check_in_event_ticket) —
-- esos RPCs jamás tocan quantity_total/status de event_ticket_types ni
-- capacity de events, solo quantity_sold/quantity_reserved dentro del
-- límite ya impuesto por su propio CHECK (sold+reserved<=quantity_total).
-- Por eso ninguno de los dos triggers de abajo escucha esas columnas.
-- =====================================================================
create or replace function public._check_event_capacity(p_event_id uuid)
returns void
language plpgsql
as $$
declare
  v_capacity integer;
  v_committed integer;
begin
  select capacity into v_capacity from public.events where id = p_event_id;
  if v_capacity is null then
    return; -- sin aforo definido: nada que validar, a propósito (ver cabecera).
  end if;

  select coalesce(sum(
    case when status = 'active' then quantity_total
    else quantity_sold + quantity_reserved end
  ), 0)
  into v_committed
  from public.event_ticket_types
  where event_id = p_event_id;

  if v_committed > v_capacity then
    raise exception 'event_capacity_exceeded' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public._check_event_capacity(uuid) from public, anon, authenticated;

create or replace function public.enforce_event_capacity_from_ticket_type()
returns trigger
language plpgsql
as $$
begin
  perform public._check_event_capacity(coalesce(new.event_id, old.event_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.enforce_event_capacity_from_event()
returns trigger
language plpgsql
as $$
begin
  perform public._check_event_capacity(new.id);
  return new;
end;
$$;

drop trigger if exists event_ticket_types_capacity_trg on public.event_ticket_types;
create trigger event_ticket_types_capacity_trg
  after insert or update of quantity_total, status, event_id on public.event_ticket_types
  for each row execute function public.enforce_event_capacity_from_ticket_type();

drop trigger if exists events_capacity_change_trg on public.events;
create trigger events_capacity_change_trg
  after update of capacity on public.events
  for each row execute function public.enforce_event_capacity_from_event();
