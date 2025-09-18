-- ===============================
-- RIFEX: RLS, trigger de creador y columnas de emails/pagos
-- ===============================

-- --- Raffles: columnas para dueño ---
alter table public.raffles add column if not exists creator_id uuid;
alter table public.raffles add column if not exists creator_email text;

-- Habilitar RLS (si no lo estaba)
alter table public.raffles enable row level security;
alter table public.tickets enable row level security;

-- --- Trigger: completar creator_id / creator_email en INSERT ---
create or replace function public.rifex_set_creator_defaults()
returns trigger
language plpgsql
security definer
as $$
declare
  jwt jsonb := null;
  jwt_email text := null;
begin
  -- Obtener email desde el JWT (si existe)
  begin
    jwt := current_setting('request.jwt.claims', true)::jsonb;
    if jwt ? 'email' then
      jwt_email := jwt->>'email';
    end if;
  exception when others then
    jwt_email := null;
  end;

  if NEW.creator_id is null then
    NEW.creator_id := auth.uid();
  end if;

  if NEW.creator_email is null then
    NEW.creator_email := coalesce(jwt_email, NEW.creator_email);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_rifex_set_creator_defaults on public.raffles;
create trigger trg_rifex_set_creator_defaults
before insert on public.raffles
for each row
execute function public.rifex_set_creator_defaults();

-- --- Policies para raffles ---
drop policy if exists raffles_select_own on public.raffles;
create policy raffles_select_own
on public.raffles
for select
to authenticated
using ( creator_id = auth.uid() or creator_email = (auth.jwt()->>'email') );

drop policy if exists raffles_insert_own on public.raffles;
create policy raffles_insert_own
on public.raffles
for insert
to authenticated
with check ( creator_id = auth.uid() or creator_email = (auth.jwt()->>'email') );

drop policy if exists raffles_update_own on public.raffles;
create policy raffles_update_own
on public.raffles
for update
to authenticated
using ( creator_id = auth.uid() or creator_email = (auth.jwt()->>'email') )
with check ( creator_id = auth.uid() or creator_email = (auth.jwt()->>'email') );

drop policy if exists raffles_delete_own on public.raffles;
create policy raffles_delete_own
on public.raffles
for delete
to authenticated
using ( creator_id = auth.uid() or creator_email = (auth.jwt()->>'email') );

-- acceso público de lectura a rifas activas/cerradas
drop policy if exists raffles_select_public_active on public.raffles;
create policy raffles_select_public_active
on public.raffles
for select
to anon
using ( status in ('active','closed') );

-- --- Policies para tickets ---
drop policy if exists tickets_select_public_by_raffle on public.tickets;
create policy tickets_select_public_by_raffle
on public.tickets
for select
to anon
using (
  exists (
    select 1 from public.raffles r
    where r.id = tickets.raffle_id
      and r.status in ('active','closed')
  )
);

drop policy if exists tickets_select_creator on public.tickets;
create policy tickets_select_creator
on public.tickets
for select
to authenticated
using (
  exists (
    select 1 from public.raffles r
    where r.id = tickets.raffle_id
      and (r.creator_id = auth.uid() or r.creator_email = (auth.jwt()->>'email'))
  )
);

-- --- Payments: columnas para conciliación y mailing ---
alter table public.payments add column if not exists mp_payment_id text;
alter table public.payments add column if not exists raffle_id uuid;
alter table public.payments add column if not exists buyer_email text;
alter table public.payments add column if not exists buyer_name text;
alter table public.payments add column if not exists status text;
alter table public.payments add column if not exists status_detail text;
alter table public.payments add column if not exists amount_cents integer;
alter table public.payments add column if not exists numbers integer[] default '{}'::int[] not null;
alter table public.payments add column if not exists emailed_buyer boolean default false not null;
alter table public.payments add column if not exists emailed_creator boolean default false not null;
alter table public.payments add column if not exists created_at timestamptz default now() not null;

-- Índices/únicos
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='payments_raffle_id_idx') then
    create index payments_raffle_id_idx on public.payments(raffle_id);
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='payments_mp_payment_id_key') then
    create unique index payments_mp_payment_id_key on public.payments(mp_payment_id);
  end if;
end$$;

-- --- Backfill suave de creator_email desde auth.users, si aplica ---
update public.raffles r
set creator_email = u.email
from auth.users u
where r.creator_id = u.id
  and coalesce(r.creator_email,'') = '';
