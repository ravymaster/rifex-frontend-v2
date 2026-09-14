-- PRE-LAUNCH-FIX-1: cierre de P0-2 (integridad ticket/pago), P1-2 (RLS
-- legal_declarations) y P1-3 (rate limiting minimo). Aditiva: no borra ni
-- renombra ninguna columna/tabla existente.

-- =====================================================================
-- P0-2a: reserva atomica de tickets, todo-o-nada.
-- =====================================================================
-- Invariante que protege: dos compradores concurrentes NUNCA pueden
-- terminar ambos creyendo que reservaron el mismo numero. La UPDATE y la
-- verificacion de "se reservaron TODOS los numeros pedidos" ocurren
-- dentro de la misma transaccion implicita de esta funcion — si otra
-- transaccion concurrente ya gano la fila (status ya no es
-- available/free), la UPDATE de esta llamada simplemente no la matchea,
-- v_reserved queda por debajo de v_expected, y el RAISE EXCEPTION revierte
-- CUALQUIER reserva parcial que esta misma llamada hubiera logrado sobre
-- otros numeros del mismo pedido (todo o nada, nunca una reserva a
-- medias). El caller (checkout/mp.js) debe tratar el error
-- 'tickets_unavailable' como 409, nunca continuar hacia MP.
create or replace function public.reserve_tickets_for_purchase(
  p_raffle_id uuid,
  p_numbers int[],
  p_purchase_id uuid,
  p_hold_until timestamptz
) returns setof public.tickets
language plpgsql
as $$
declare
  v_expected int := coalesce(array_length(p_numbers, 1), 0);
  v_reserved int;
begin
  if v_expected = 0 then
    raise exception 'no_numbers_requested';
  end if;

  update public.tickets
    set status = 'pending',
        purchase_id = p_purchase_id,
        hold_until = p_hold_until
    where raffle_id = p_raffle_id
      and number = any(p_numbers)
      and status in ('available', 'free');

  get diagnostics v_reserved = row_count;

  if v_reserved <> v_expected then
    raise exception 'tickets_unavailable';
  end if;

  return query
    select * from public.tickets
    where raffle_id = p_raffle_id and number = any(p_numbers);
end;
$$;

-- =====================================================================
-- P0-2b: convergencia autoritativa de un pago aprobado -> tickets sold.
-- =====================================================================
-- Invariante que protege: "un ticket perteneciente a una purchase
-- APPROVED jamas puede volver a available", y "un pago approved converge
-- de forma autoritativa a sus tickets sold, sin depender del navegador".
-- Se llama SIEMPRE con purchase_id como autoridad — nunca por
-- raffle_id+number sueltos (eso fue exactamente el bug: permitia que un
-- pago de la purchase B marcara sold un ticket que en realidad
-- pertenecia/estaba reservado por la purchase A). Idempotente: llamarla
-- N veces para la misma purchase ya aprobada no tiene efecto adicional
-- (la UPDATE con status<>'sold' en el WHERE hace que la segunda llamada
-- en adelante no matchee ninguna fila).
create or replace function public.converge_purchase_tickets_sold(
  p_purchase_id uuid
) returns setof public.tickets
language plpgsql
as $$
declare
  v_purchase public.purchases;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id;
  if not found then
    raise exception 'purchase_not_found';
  end if;
  if v_purchase.status <> 'approved' then
    raise exception 'purchase_not_approved';
  end if;

  update public.tickets
    set status = 'sold'
    where purchase_id = p_purchase_id
      and status <> 'sold';

  return query
    select * from public.tickets where purchase_id = p_purchase_id;
end;
$$;

-- =====================================================================
-- P1-2: cerrar INSERT/SELECT/UPDATE/DELETE anonimo en legal_declarations.
-- =====================================================================
-- Sin politicas permisivas: cualquier acceso via anon/authenticated queda
-- denegado por default al habilitar RLS. El unico camino de escritura
-- real (create_raffle_with_declarations) sigue funcionando exactamente
-- igual porque corre bajo el cliente service-role, que ignora RLS por
-- diseno (mismo criterio ya documentado en 2026-08-20_draw1b_atomic_rpcs.sql).
alter table public.legal_declarations enable row level security;

-- =====================================================================
-- P1-3: rate limiting minimo, atomico, valido entre multiples instancias
-- serverless (Postgres como fuente de verdad compartida, sin Redis ni
-- infraestructura nueva).
-- =====================================================================
-- Ventana fija (fixed window): simple y suficiente para una barrera
-- pre-launch razonable. Limitacion conocida y documentada: un cliente
-- podria hacer hasta 2x el limite justo en el borde de dos ventanas
-- consecutivas (p.ej. al final de una ventana y al inicio de la
-- siguiente). No es un limitador anti-abuso de nivel enterprise — es
-- deliberadamente minimo, ver src/lib/rateLimit.js para el detalle.
create table if not exists public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
create index if not exists idx_rate_limit_hits_window
  on public.rate_limit_hits(window_start);

-- Incrementa atomicamente el contador de (key, ventana) y devuelve el
-- conteo resultante. INSERT ... ON CONFLICT DO UPDATE es atomico a nivel
-- de fila en Postgres: dos llamadas concurrentes para la misma key+ventana
-- se serializan aqui, ninguna pierde un incremento (a diferencia de un
-- Map en memoria de un runtime serverless, que ademas no se comparte
-- entre instancias).
create or replace function public.rate_limit_hit(
  p_key text,
  p_window_start timestamptz
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into public.rate_limit_hits (key, window_start, count)
    values (p_key, p_window_start, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limit_hits.count + 1
  returning count into v_count;
  return v_count;
end;
$$;
