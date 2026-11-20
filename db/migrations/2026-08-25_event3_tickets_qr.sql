-- EVENT-3: emisión de tickets individuales + QR a partir de una
-- event_order 'paid'. Dominio propio (event_tickets), independiente de
-- raffles/tickets/colecta_contributions. QR = credencial, NUNCA check-in
-- (eso es EVENT-4) — GET público nunca consume ni modifica un ticket.

-- =====================================================================
-- Fase 7: separar PAYMENT STATE (event_orders.status) de FULFILLMENT
-- STATE — columnas propias, nunca se reinterpreta status='paid' como
-- "ya emitido". tickets_issued_at es también la autoridad de idempotencia
-- de la RPC de emisión (ver más abajo). tickets_email_sent_at es la
-- autoridad de idempotencia del correo (Fase 17) — un replay del webhook
-- nunca debe reenviar 20 correos.
-- =====================================================================
alter table public.event_orders
  add column if not exists tickets_issued_at timestamptz,
  add column if not exists tickets_email_sent_at timestamptz;

-- =====================================================================
-- Fase 1: event_tickets.
-- =====================================================================
create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  order_id uuid not null references public.event_orders(id) on delete cascade,
  order_item_id uuid not null references public.event_order_items(id) on delete cascade,
  ticket_type_id uuid not null references public.event_ticket_types(id),

  -- Fase 4: snapshot mínimo — el ticket debe seguir siendo comprensible
  -- si el nombre/precio del tipo cambia después. NO se duplica el evento
  -- completo (título/fecha/venue) acá: esos datos ya están en `events` y
  -- se resuelven via join en el momento de mostrar/resolver el ticket —
  -- duplicarlos agregaría una segunda fuente de verdad sin necesidad real
  -- (a diferencia del precio, que SÍ es historia financiera).
  ticket_type_name_snapshot text not null,
  unit_price_cents_snapshot bigint not null check (unit_price_cents_snapshot >= 0),

  -- Fase 2/3: tres identidades con roles distintos —
  --   id: interno, nunca expuesto como credencial.
  --   ticket_number: humano/soporte, visible, NUNCA autoridad de seguridad.
  --   qr_token: la única credencial real, opaca, alta entropía, UNIQUE.
  ticket_number text not null,
  qr_token text not null,

  -- Fase 1: solo valid/void en EVENT-3 — 'used' NO existe como estado acá
  -- a propósito, EVENT-4 lo representará vía used_at/checkin, para no
  -- forzar ahora un diseño que EVENT-4 tendría que deshacer.
  status text not null default 'valid' check (status in ('valid', 'void')),

  issued_at timestamptz not null default now(),
  used_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_tickets_ticket_number_key on public.event_tickets(ticket_number);
create unique index if not exists event_tickets_qr_token_key on public.event_tickets(qr_token);
create index if not exists event_tickets_order_id_idx on public.event_tickets(order_id);
create index if not exists event_tickets_event_id_idx on public.event_tickets(event_id);
create index if not exists event_tickets_order_item_id_idx on public.event_tickets(order_item_id);

-- =====================================================================
-- Fase 5/6: emisión exactly-once. El lock FOR UPDATE sobre la fila de la
-- orden es la autoridad de concurrencia real — dos llamadas simultáneas
-- serializan en ese lock; la segunda, al obtenerlo, ve
-- tickets_issued_at ya no-null y retorna los tickets existentes sin
-- insertar nada nuevo. Los UNIQUE de ticket_number/qr_token son defensa
-- en profundidad, no la autoridad primaria.
-- =====================================================================
create or replace function public.issue_event_order_tickets(
  p_order_id uuid
) returns setof public.event_tickets
language plpgsql
as $$
declare
  v_order public.event_orders;
  v_item record;
  v_i integer;
  v_ticket_number text;
  v_qr_token text;
  v_attempt integer;
begin
  select * into v_order from public.event_orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  -- Fase 8: SOLO 'paid' emite. approved_unfulfilled, pending, expired,
  -- cancelled — ninguno emite, ni siquiera con un mp_payment_id válido.
  if v_order.status <> 'paid' then
    raise exception 'order_not_paid';
  end if;

  -- Idempotente: ya emitido -> retorna lo existente, no vuelve a insertar.
  if v_order.tickets_issued_at is not null then
    return query select * from public.event_tickets where order_id = p_order_id order by created_at;
    return;
  end if;

  for v_item in
    select id as order_item_id, ticket_type_id, ticket_type_name_snapshot, unit_price_cents, quantity
    from public.event_order_items where order_id = p_order_id
  loop
    for v_i in 1..v_item.quantity loop
      v_attempt := 0;
      loop
        v_attempt := v_attempt + 1;
        v_ticket_number := 'RFX-EVT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
        v_qr_token := replace(gen_random_uuid()::text, '-', '');
        begin
          insert into public.event_tickets
            (event_id, order_id, order_item_id, ticket_type_id, ticket_type_name_snapshot, unit_price_cents_snapshot, ticket_number, qr_token, status)
          values
            (v_order.event_id, p_order_id, v_item.order_item_id, v_item.ticket_type_id, v_item.ticket_type_name_snapshot, v_item.unit_price_cents, v_ticket_number, v_qr_token, 'valid');
          exit;
        exception when unique_violation then
          if v_attempt >= 5 then
            raise exception 'ticket_number_or_qr_token_collision_exhausted';
          end if;
          -- colisión de baja probabilidad en ticket_number/qr_token -> reintenta con valores nuevos.
        end;
      end loop;
    end loop;
  end loop;

  update public.event_orders set tickets_issued_at = now(), updated_at = now() where id = p_order_id;

  return query select * from public.event_tickets where order_id = p_order_id order by created_at;
end;
$$;

-- =====================================================================
-- Fase 20: invalidación auditable — nunca DELETE, un ticket void sigue
-- existiendo históricamente. Backend/modelo únicamente en EVENT-3, sin
-- disparador desde UI (preparado para EVENT-4/operaciones futuras).
-- =====================================================================
create or replace function public.void_event_ticket(
  p_ticket_id uuid
) returns public.event_tickets
language plpgsql
as $$
declare
  v_ticket public.event_tickets;
begin
  select * into v_ticket from public.event_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket_not_found';
  end if;
  if v_ticket.status = 'void' then
    return v_ticket;
  end if;
  update public.event_tickets set status = 'void', updated_at = now() where id = p_ticket_id returning * into v_ticket;
  return v_ticket;
end;
$$;

-- =====================================================================
-- Fase 21: RLS default-deny — mismo criterio que event_orders/
-- event_order_items. Acceso comprador vía access_token de la orden
-- (server-side), resolución QR vía qr_token (server-side), organizador
-- owner-only vía API, todo lo demás service_role.
-- =====================================================================
alter table public.event_tickets enable row level security;
revoke all on public.event_tickets from public, anon, authenticated;

revoke execute on function public.issue_event_order_tickets(uuid) from public, anon, authenticated;
revoke execute on function public.void_event_ticket(uuid) from public, anon, authenticated;
grant execute on function public.issue_event_order_tickets(uuid) to service_role;
grant execute on function public.void_event_ticket(uuid) to service_role;
