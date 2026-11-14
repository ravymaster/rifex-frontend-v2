-- db/migrations/2026-11-13a_commission_snapshot.sql
-- Snapshot de comisión por operación (Eventos y Campañas). ADITIVA:
-- - columnas nuevas que admiten NULL y SIN default (una operación creada por
--   código anterior queda en NULL, nunca etiquetada con una tasa supuesta);
-- - checks: bps entero 0..10000, política con formato cerrado, y ambos
--   campos presentes o ambos ausentes;
-- - función nueva create_event_order_v2 (la original create_event_order
--   queda intacta para el código anterior y para rollback).
-- No cambia columnas monetarias, RLS, políticas ni grants de tablas.

alter table public.event_orders
  add column if not exists platform_fee_bps integer,
  add column if not exists commission_policy text;

alter table public.event_orders
  add constraint event_orders_platform_fee_bps_range
    check (platform_fee_bps is null or (platform_fee_bps >= 0 and platform_fee_bps <= 10000)),
  add constraint event_orders_commission_policy_format
    check (commission_policy is null or commission_policy ~ '^[a-z][a-z0-9_-]{0,31}$'),
  add constraint event_orders_commission_snapshot_pair
    check ((platform_fee_bps is null) = (commission_policy is null));

alter table public.colecta_contributions
  add column if not exists platform_fee_bps integer,
  add column if not exists commission_policy text;

alter table public.colecta_contributions
  add constraint colecta_contributions_platform_fee_bps_range
    check (platform_fee_bps is null or (platform_fee_bps >= 0 and platform_fee_bps <= 10000)),
  add constraint colecta_contributions_commission_policy_format
    check (commission_policy is null or commission_policy ~ '^[a-z][a-z0-9_-]{0,31}$'),
  add constraint colecta_contributions_commission_snapshot_pair
    check ((platform_fee_bps is null) = (commission_policy is null));

comment on column public.event_orders.platform_fee_bps is 'Comisión aplicada al crear la orden, en puntos base (100 = 1 %). Snapshot: nunca se recalcula.';
comment on column public.event_orders.commission_policy is 'Política comercial aplicada al crear la orden (standard, launch). Snapshot.';
comment on column public.colecta_contributions.platform_fee_bps is 'Comisión aplicada al crear el aporte, en puntos base (100 = 1 %). Snapshot: nunca se recalcula.';
comment on column public.colecta_contributions.commission_policy is 'Política comercial aplicada al crear el aporte (standard, launch). Snapshot.';

-- Misma lógica que create_event_order (2026-08-24), con la tasa en puntos
-- base enteros y el snapshot guardado en la misma transacción.
create or replace function public.create_event_order_v2(
  p_event_id uuid,
  p_items jsonb,
  p_buyer_email text,
  p_buyer_name text,
  p_platform_fee_bps integer,
  p_commission_policy text,
  p_reservation_minutes integer
) returns public.event_orders
language plpgsql
set search_path = public
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
  -- Snapshot de comisión decidido por el servidor (commissionPolicy.js):
  -- puntos base enteros 0..10000 y código de política.
  if p_platform_fee_bps is null or p_platform_fee_bps < 0 or p_platform_fee_bps > 10000 then
    raise exception 'invalid_platform_fee_bps';
  end if;
  if p_commission_policy is null or p_commission_policy !~ '^[a-z][a-z0-9_-]{0,31}$' then
    raise exception 'invalid_commission_policy';
  end if;

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
    (event_id, buyer_email, buyer_name, status, currency, subtotal_cents, platform_fee_cents, total_cents, reservation_expires_at, platform_fee_bps, commission_policy)
  values
    (p_event_id, lower(trim(p_buyer_email)), nullif(trim(coalesce(p_buyer_name, '')), ''), 'pending', 'CLP', 0, 0, 0, v_expires, p_platform_fee_bps, p_commission_policy)
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

  -- Aritmética entera: equivale a floor(subtotal * bps / 10000).
  v_platform_fee := (v_subtotal * p_platform_fee_bps) / 10000;
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

revoke all on function public.create_event_order_v2(uuid, jsonb, text, text, integer, text, integer) from public;
revoke all on function public.create_event_order_v2(uuid, jsonb, text, text, integer, text, integer) from anon, authenticated;
grant execute on function public.create_event_order_v2(uuid, jsonb, text, text, integer, text, integer) to service_role;
