-- EVENT-2: checkout transaccional para Eventos — event_orders,
-- event_order_items, inventario con reserva atomica (quantity_reserved),
-- y las RPCs autoritativas create_event_order / expire_event_order /
-- mark_event_order_paid. Dominio propio, independiente de purchases/
-- tickets/colecta_contributions (ver EVENT-2 Fase 0: REUTILIZAR
-- INFRAESTRUCTURA, NO REUTILIZAR DOMINIO).
--
-- Invariantes que este archivo protege (ver informe EVENT-2 Fase 1):
--   1. stock nunca negativo (CHECK quantity_sold+quantity_reserved<=total)
--   2/3/4. reserva atomica exactamente una vez, libera exactamente una vez
--   5/6/7. orden pagada es terminal; webhook repetido/replay no acredita 2x
--   8/9/10. precio snapshoteado, comision snapshoteada, total = sum(items)
--   11/12/13/14. max_per_order, ticket hidden, evento no vendible, sin stock
--   15. late payment nunca roba stock ya vendido (ver mark_event_order_paid)

-- =====================================================================
-- Fase 4: inventario — autoridad atomica de reserva.
-- =====================================================================
alter table public.event_ticket_types
  add column if not exists quantity_reserved integer not null default 0;

alter table public.event_ticket_types
  add constraint event_ticket_types_reserved_nonneg check (quantity_reserved >= 0);

alter table public.event_ticket_types
  add constraint event_ticket_types_stock_bound check (quantity_sold + quantity_reserved <= quantity_total);

-- =====================================================================
-- Fase 2: event_orders.
-- =====================================================================
create table if not exists public.event_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  buyer_email text not null,
  buyer_name text,
  status text not null default 'pending'
    check (status in ('pending','paid','expired','cancelled','approved_unfulfilled')),
  currency text not null default 'CLP',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  -- total = subtotal: EVENT-2 Fase 16 — nunca se le cobra al comprador un
  -- 7% adicional, la comision Rifex sale del payout del organizador via
  -- marketplace_fee (igual que Rifas/Colectas), no se suma al total pagado.
  constraint event_orders_total_eq_subtotal check (total_cents = subtotal_cents),
  mp_preference_id text,
  mp_payment_id text,
  -- token opaco para que un comprador guest (sin cuenta) pueda recuperar
  -- su orden — nunca el id de la orden ni el email sirven como credencial.
  -- gen_random_uuid() es core Postgres (sin depender de pgcrypto, que no
  -- está disponible en este proyecto) — dos UUIDs v4 concatenados sin
  -- guiones dan 64 hex chars (~244 bits de una CSPRNG), sobra margen.
  access_token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  reservation_expires_at timestamptz,
  paid_at timestamptz,
  -- Fase 14: sin flujo de refund certificado en el repo (ver informe) —
  -- cancelar un evento con órdenes pagadas NUNCA revierte el pago
  -- automáticamente ni inventa una llamada a la API de MP. Esta bandera
  -- es puramente informativa: marca qué órdenes pagadas quedaron
  -- pendientes de resolución operativa/manual tras la cancelación.
  refund_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_orders_access_token_key on public.event_orders(access_token);
-- unique cuando no-null: multiples pending sin pago aun (null) conviven,
-- pero un mismo pago de MP nunca puede acreditar dos ordenes distintas.
create unique index if not exists event_orders_mp_payment_id_key on public.event_orders(mp_payment_id) where mp_payment_id is not null;
create index if not exists event_orders_event_id_idx on public.event_orders(event_id);
create index if not exists event_orders_status_idx on public.event_orders(status);
create index if not exists event_orders_expiry_idx on public.event_orders(status, reservation_expires_at) where status = 'pending';

-- =====================================================================
-- Fase 3: event_order_items — snapshot autoritativo, nunca reconstruido
-- leyendo el precio/nombre ACTUAL del ticket type.
-- =====================================================================
create table if not exists public.event_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.event_orders(id) on delete cascade,
  ticket_type_id uuid not null references public.event_ticket_types(id),
  ticket_type_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents = quantity * unit_price_cents),
  -- ver mark_event_order_paid: distingue, por item, si realmente convergio
  -- a sold (necesario para el caso late-payment parcial, invariante 15).
  fulfilled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists event_order_items_order_id_idx on public.event_order_items(order_id);
create index if not exists event_order_items_ticket_type_id_idx on public.event_order_items(ticket_type_id);

-- =====================================================================
-- Fase 5: reserva atomica todo-o-nada. Cualquier RAISE EXCEPTION revierte
-- TODA la transaccion (orden + items + decrementos de stock ya hechos en
-- iteraciones previas del loop) — mismo criterio que
-- reserve_tickets_for_purchase (Rifas).
-- =====================================================================
create or replace function public.create_event_order(
  p_event_id uuid,
  p_items jsonb,               -- [{"ticket_type_id":"...","quantity":2}, ...]
  p_buyer_email text,
  p_buyer_name text,
  p_platform_fee_rate numeric,
  p_reservation_minutes integer
) returns public.event_orders
language plpgsql
as $$
declare
  v_event public.events;
  v_item jsonb;
  v_tt public.event_ticket_types;
  v_qty integer;
  v_subtotal bigint := 0;
  v_platform_fee bigint;
  v_order public.event_orders;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_line_total bigint;
  v_updated integer;
  v_ticket_type_id uuid;
begin
  if p_buyer_email is null or trim(p_buyer_email) = '' then
    raise exception 'missing_buyer_email';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_items';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found';
  end if;
  if v_event.status <> 'published' then
    raise exception 'event_not_sellable';
  end if;
  if v_event.ends_at < v_now then
    raise exception 'event_ended';
  end if;

  v_expires := v_now + make_interval(mins => greatest(1, p_reservation_minutes));

  insert into public.event_orders
    (event_id, buyer_email, buyer_name, status, currency, subtotal_cents, platform_fee_cents, total_cents, reservation_expires_at)
  values
    (p_event_id, lower(trim(p_buyer_email)), nullif(trim(coalesce(p_buyer_name, '')), ''), 'pending', 'CLP', 0, 0, 0, v_expires)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ticket_type_id := nullif(v_item->>'ticket_type_id', '')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    if v_ticket_type_id is null then
      raise exception 'invalid_ticket_type_id';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_quantity';
    end if;

    select * into v_tt from public.event_ticket_types where id = v_ticket_type_id for update;
    if not found then
      raise exception 'ticket_type_not_found';
    end if;
    if v_tt.event_id <> p_event_id then
      raise exception 'ticket_type_event_mismatch';
    end if;
    if v_tt.status <> 'active' then
      raise exception 'ticket_type_not_active';
    end if;
    if v_tt.sales_start_at is not null and v_tt.sales_start_at > v_now then
      raise exception 'sales_not_started';
    end if;
    if v_tt.sales_end_at is not null and v_tt.sales_end_at < v_now then
      raise exception 'sales_ended';
    end if;
    if v_qty > v_tt.max_per_order then
      raise exception 'exceeds_max_per_order';
    end if;

    update public.event_ticket_types
      set quantity_reserved = quantity_reserved + v_qty
      where id = v_tt.id
        and quantity_total - quantity_sold - quantity_reserved >= v_qty;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'insufficient_stock';
    end if;

    v_line_total := v_qty * v_tt.price_cents;
    v_subtotal := v_subtotal + v_line_total;

    insert into public.event_order_items
      (order_id, ticket_type_id, ticket_type_name_snapshot, quantity, unit_price_cents, line_total_cents)
    values
      (v_order.id, v_tt.id, v_tt.name, v_qty, v_tt.price_cents, v_line_total);
  end loop;

  v_platform_fee := floor(v_subtotal * p_platform_fee_rate);
  if v_platform_fee > v_subtotal then
    v_platform_fee := v_subtotal;
  end if;
  if v_platform_fee < 0 then
    v_platform_fee := 0;
  end if;

  update public.event_orders
    set subtotal_cents = v_subtotal, platform_fee_cents = v_platform_fee, total_cents = v_subtotal, updated_at = now()
    where id = v_order.id
    returning * into v_order;

  return v_order;
end;
$$;

-- =====================================================================
-- Fase 6: expiracion idempotente. p_force=true salta el chequeo de TTL
-- (usado por el checkout API para compensar una preference de MP fallida
-- sin dejar el inventario secuestrado hasta que el TTL natural expire).
-- El FOR UPDATE serializa a dos llamadas concurrentes sobre la MISMA
-- orden: la segunda ve status ya != 'pending' y no muta nada.
-- =====================================================================
create or replace function public.expire_event_order(
  p_order_id uuid,
  p_force boolean default false
) returns boolean
language plpgsql
as $$
declare
  v_order public.event_orders;
  v_item record;
  v_rows integer;
begin
  select * into v_order from public.event_orders where id = p_order_id for update;
  if not found then
    return false;
  end if;
  if v_order.status <> 'pending' then
    return false;
  end if;
  if not p_force and v_order.reservation_expires_at > now() then
    return false;
  end if;

  update public.event_orders
    set status = 'expired', updated_at = now()
    where id = p_order_id and status = 'pending';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  for v_item in select ticket_type_id, quantity from public.event_order_items where order_id = p_order_id
  loop
    update public.event_ticket_types
      set quantity_reserved = greatest(0, quantity_reserved - v_item.quantity)
      where id = v_item.ticket_type_id;
  end loop;

  return true;
end;
$$;

-- =====================================================================
-- Fase 12/13: reconciliacion autoritativa pending/expired -> paid.
-- Idempotente (paid es terminal, se retorna tal cual sin re-tocar).
-- Camino normal (status='pending'): la reserva viva garantiza el cupo,
-- mueve reserved->sold.
-- Camino late-payment (status='expired', ver Fase 13 CASO OBLIGATORIO):
-- la reserva YA fue liberada por expire_event_order — este camino intenta
-- encontrar stock NUEVO sin tocar reserved; si no alcanza para todos los
-- items, esos quedan fulfilled=false y la orden termina
-- 'approved_unfulfilled', nunca le quita stock a quien compro despues.
-- =====================================================================
create or replace function public.mark_event_order_paid(
  p_order_id uuid,
  p_mp_payment_id text
) returns public.event_orders
language plpgsql
as $$
declare
  v_order public.event_orders;
  v_item record;
  v_all_fulfilled boolean := true;
  v_was_pending boolean;
begin
  select * into v_order from public.event_orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'paid' then
    return v_order;
  end if;
  if v_order.status = 'approved_unfulfilled' then
    return v_order;
  end if;
  if v_order.status not in ('pending', 'expired') then
    raise exception 'order_not_payable';
  end if;

  v_was_pending := (v_order.status = 'pending');

  for v_item in
    select id, ticket_type_id, quantity from public.event_order_items where order_id = p_order_id for update
  loop
    if v_was_pending then
      update public.event_ticket_types
        set quantity_reserved = greatest(0, quantity_reserved - v_item.quantity),
            quantity_sold = quantity_sold + v_item.quantity
        where id = v_item.ticket_type_id
          and quantity_sold + v_item.quantity <= quantity_total;
    else
      update public.event_ticket_types
        set quantity_sold = quantity_sold + v_item.quantity
        where id = v_item.ticket_type_id
          and quantity_sold + v_item.quantity <= quantity_total;
    end if;

    if found then
      update public.event_order_items set fulfilled = true where id = v_item.id;
    else
      v_all_fulfilled := false;
    end if;
  end loop;

  update public.event_orders
    set status = case when v_all_fulfilled then 'paid' else 'approved_unfulfilled' end,
        paid_at = coalesce(paid_at, now()),
        mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
        updated_at = now()
    where id = p_order_id
    returning * into v_order;

  return v_order;
end;
$$;

-- =====================================================================
-- Fase 19: RLS default-deny — misma politica que events/event_ticket_types
-- (EVENT-1) y legal_declarations/rate_limit_hits (PRE-LAUNCH-FIX-1/2).
-- Sin lectura publica, sin escritura publica. Todo acceso pasa por APIs
-- server-side (service_role): comprador guest via access_token opaco,
-- organizador via ownership-check en la API (join a events.organizer_id).
-- =====================================================================
alter table public.event_orders enable row level security;
alter table public.event_order_items enable row level security;

revoke all on public.event_orders from public, anon, authenticated;
revoke all on public.event_order_items from public, anon, authenticated;

revoke execute on function public.create_event_order(uuid, jsonb, text, text, numeric, integer) from public, anon, authenticated;
revoke execute on function public.expire_event_order(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.mark_event_order_paid(uuid, text) from public, anon, authenticated;

grant execute on function public.create_event_order(uuid, jsonb, text, text, numeric, integer) to service_role;
grant execute on function public.expire_event_order(uuid, boolean) to service_role;
grant execute on function public.mark_event_order_paid(uuid, text) to service_role;
