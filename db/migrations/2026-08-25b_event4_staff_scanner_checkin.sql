-- EVENT-4: staff (rol `door`) + check-in atómico de entradas emitidas por
-- EVENT-3. Dominio propio (event_staff, event_checkins), independiente de
-- raffles/tickets/colecta_contributions. No reconstruye EVENT-1/2/3 — solo
-- agrega la capa de acceso sobre `event_tickets.used_at`, dejada nullable
-- y sin escritor a propósito desde EVENT-3.
--
-- SCAN != CHECK-IN se mantiene: GET /t/[token] (EVENT-3) sigue sin tocar
-- esta migración, sigue sin consumir nada. Solo `check_in_event_ticket`
-- (definida acá) puede escribir `used_at`.
--
-- Especificación completa: docs/events/EVENT4_STAFF_SCANNER_CHECKIN.md

-- =====================================================================
-- event_staff: colaboradores adicionales de un evento. `events.organizer_id`
-- sigue siendo la autoridad del owner — esta tabla nunca la reemplaza,
-- solo agrega personal con permisos acotados (rol `door`).
-- =====================================================================
create table if not exists public.event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'door' check (role in ('door')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  -- Snapshot puramente informativo para mostrar en el panel sin tener que
  -- volver a resolver auth.users en cada listado — nunca autoritativo,
  -- mismo criterio que ticket_type_name_snapshot en EVENT-2/3.
  user_email_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_staff_unique_per_event unique (event_id, user_id)
);

create index if not exists event_staff_event_id_idx on public.event_staff(event_id);
create index if not exists event_staff_user_id_idx on public.event_staff(user_id);

-- =====================================================================
-- event_checkins: auditoría de accesos exitosos. Nunca se borra, nunca se
-- actualiza — una fila por check-in exitoso. `used_at` en event_tickets
-- es la autoridad de consumo primaria (protegida por el lock de fila en
-- check_in_event_ticket); el UNIQUE de acá es defensa en profundidad, no
-- la autoridad principal — mismo criterio que los UNIQUE de
-- ticket_number/qr_token en EVENT-3.
-- =====================================================================
create table if not exists public.event_checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_id uuid not null references public.event_tickets(id) on delete cascade,
  checked_in_by uuid not null,
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint event_checkins_ticket_unique unique (ticket_id)
);

create index if not exists event_checkins_event_id_idx on public.event_checkins(event_id);
create index if not exists event_checkins_ticket_id_idx on public.event_checkins(ticket_id);

-- Índice parcial para el conteo "Ingresaron" del panel — solo filas
-- realmente consumidas, evento por evento.
create index if not exists event_tickets_used_at_idx
  on public.event_tickets(event_id, used_at) where used_at is not null;

-- =====================================================================
-- find_user_id_by_email: única función de esta migración con
-- SECURITY DEFINER, y con razón explícita — auth.users no está expuesta
-- por PostgREST bajo ningún rol, así que resolver "existe un usuario con
-- este email" requiere privilegio elevado. search_path fijado
-- explícitamente (public, auth) para evitar el ataque clásico de
-- search_path hijacking sobre funciones SECURITY DEFINER. Nunca es
-- búsqueda pública: solo acepta un email exacto, nunca devuelve un
-- listado, y está revocada de anon/authenticated — únicamente el backend
-- (service_role) puede invocarla, y solo lo hace el endpoint owner-only
-- de alta de staff.
-- =====================================================================
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- =====================================================================
-- check_in_event_ticket: autoridad atómica de check-in. A diferencia de
-- find_user_id_by_email, esta función NO usa SECURITY DEFINER — mismo
-- criterio que create_event_order/issue_event_order_tickets (EVENT-2/3):
-- ya se ejecuta como service_role (el único rol con GRANT EXECUTE), que
-- ya tiene los privilegios reales que necesita sobre las tablas public.*
-- involucradas; agregar SECURITY DEFINER acá no cambiaría nada de
-- seguridad real y sí ampliaría innecesariamente la superficie a
-- auditar. search_path no se fija explícitamente por el mismo motivo:
-- sin SECURITY DEFINER, no hay elevación de privilegio que un
-- search_path hostil pueda explotar.
--
-- Orden real de validación (ligera adaptación respecto al orden
-- conceptual del documento canónico): se resuelve y lockea el ticket
-- PRIMERO porque su event_id real es la única fuente confiable para
-- decidir "pertenece al evento del scanner" — nunca se confía en qué
-- p_event_id mandó el cliente para otra cosa que no sea esa comparación.
--
-- 1. actor presente (guard barato, sin tocar DB);
-- 2. resolver + lockear ticket por qr_token (FOR UPDATE — autoridad real
--    de concurrencia, serializa cualquier llamada simultánea sobre el
--    MISMO ticket);
-- 3. ticket pertenece al evento del scanner (cross-event);
-- 4. autorización: organizer del evento, o staff `door` `active` de ESE
--    evento;
-- 5. evento no cancelado;
-- 6. ticket no void;
-- 7. used_at IS NULL (si no, already_used — used_at nunca se toca);
-- 8. marcar used_at + insertar event_checkins, todo en la misma
--    transacción implícita de la llamada a la función.
--
-- Prohibido SELECT->JS->UPDATE: toda la decisión y la escritura ocurren
-- dentro de esta única función, bajo el lock adquirido en el paso 2.
-- =====================================================================
create or replace function public.check_in_event_ticket(
  p_qr_token text,
  p_actor_user_id uuid,
  p_event_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_ticket public.event_tickets;
  v_event public.events;
  v_authorized boolean;
  v_checkin public.event_checkins;
begin
  if p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_actor');
  end if;
  if p_event_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_event');
  end if;
  if p_qr_token is null or length(p_qr_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_ticket from public.event_tickets where qr_token = p_qr_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ticket_not_found');
  end if;

  if v_ticket.event_id <> p_event_id then
    return jsonb_build_object('ok', false, 'error', 'ticket_wrong_event');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'event_not_found');
  end if;

  v_authorized := (v_event.organizer_id = p_actor_user_id)
    or exists (
      select 1 from public.event_staff s
      where s.event_id = p_event_id
        and s.user_id = p_actor_user_id
        and s.role = 'door'
        and s.status = 'active'
    );
  if not v_authorized then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if v_event.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'event_cancelled');
  end if;

  if v_ticket.status <> 'valid' then
    return jsonb_build_object('ok', false, 'error', 'ticket_void');
  end if;

  if v_ticket.used_at is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_used',
      'used_at', v_ticket.used_at,
      'ticket', jsonb_build_object(
        'ticket_number', v_ticket.ticket_number,
        'ticket_type_name', v_ticket.ticket_type_name_snapshot
      )
    );
  end if;

  update public.event_tickets
    set used_at = now(), updated_at = now()
    where id = v_ticket.id
    returning * into v_ticket;

  insert into public.event_checkins (event_id, ticket_id, checked_in_by)
    values (p_event_id, v_ticket.id, p_actor_user_id)
    returning * into v_checkin;

  return jsonb_build_object(
    'ok', true,
    'result', 'pass',
    'ticket', jsonb_build_object(
      'ticket_number', v_ticket.ticket_number,
      'ticket_type_name', v_ticket.ticket_type_name_snapshot,
      'used_at', v_ticket.used_at
    ),
    'checkin_id', v_checkin.id
  );
end;
$$;

revoke execute on function public.check_in_event_ticket(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_in_event_ticket(text, uuid, uuid) to service_role;

-- =====================================================================
-- RLS default-deny — mismo criterio que event_orders/event_order_items/
-- event_tickets (EVENT-2/3) y legal_declarations/rate_limit_hits
-- (PRE-LAUNCH-FIX-1/2). Sin SELECT público, sin escritura pública. Todo
-- acceso pasa por APIs server-side (service_role): gestión de staff
-- owner-only vía ownership-check en la API, check-in vía la RPC de
-- arriba, consulta de "quién soy" también owner/staff-only vía API.
-- =====================================================================
alter table public.event_staff enable row level security;
alter table public.event_checkins enable row level security;

revoke all on public.event_staff from public, anon, authenticated;
revoke all on public.event_checkins from public, anon, authenticated;
