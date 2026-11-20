-- EVENT-1 — Foundation. Dominio nuevo e independiente: NO toca raffles,
-- tickets, purchases, colectas ni ninguna tabla existente. Reutiliza
-- únicamente la infraestructura transversal ya certificada (auth.uid(),
-- mismo patrón de RLS default-deny-en-writes que legal_declarations y
-- rate_limit_hits desde PRE-LAUNCH-FIX-1/2 — nunca el patrón legacy de
-- policies de escritura directa por authenticated que todavía tiene
-- `raffles` desde 2025-09-18 y que la app ya no usa en la práctica: todo
-- write pasa por API server-side con service-role, que bypassa RLS).
--
-- Solo dos tablas en EVENT-1: events, event_ticket_types. Nada de orders,
-- tickets emitidos, QR, staff, checkins — eso es EVENT-2 en adelante.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null,
  title text not null,
  description text,
  cover_image_url text,
  gallery_urls text[] not null default '{}'::text[],
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Santiago',
  venue_name text,
  address text,
  terms_text text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_status_check check (status in ('draft', 'published', 'cancelled')),
  constraint events_dates_check check (ends_at > starts_at)
);

create index if not exists events_organizer_id_idx on public.events(organizer_id);
create index if not exists events_status_idx on public.events(status);

create table if not exists public.event_ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price_cents integer not null,
  quantity_total integer not null,
  quantity_sold integer not null default 0,
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  max_per_order integer not null default 10,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_ticket_types_status_check check (status in ('active', 'hidden')),
  constraint event_ticket_types_price_check check (price_cents >= 0),
  constraint event_ticket_types_qty_total_check check (quantity_total > 0),
  constraint event_ticket_types_qty_sold_check check (quantity_sold >= 0),
  constraint event_ticket_types_qty_sold_le_total_check check (quantity_sold <= quantity_total),
  constraint event_ticket_types_max_per_order_check check (max_per_order > 0),
  constraint event_ticket_types_sales_window_check check (
    sales_start_at is null or sales_end_at is null or sales_end_at > sales_start_at
  )
);

create index if not exists event_ticket_types_event_id_idx on public.event_ticket_types(event_id);

-- RLS: default-deny en writes (todo pasa por API server-side con
-- service-role, que bypassa RLS de por sí) — mismo criterio que
-- legal_declarations/rate_limit_hits. Único SELECT público: eventos
-- publicados, y tipos de entrada activos de esos eventos.
alter table public.events enable row level security;
alter table public.event_ticket_types enable row level security;

drop policy if exists events_select_public on public.events;
create policy events_select_public
on public.events
for select
to anon, authenticated
using (status = 'published');

drop policy if exists event_ticket_types_select_public on public.event_ticket_types;
create policy event_ticket_types_select_public
on public.event_ticket_types
for select
to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1 from public.events e
    where e.id = event_ticket_types.event_id
      and e.status = 'published'
  )
);
