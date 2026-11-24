-- db/migrations/2026-11-24a_warp_pilot_requests.sql
-- Warp Conversacional — solicitudes de piloto (Sprint 1, solo DEV hasta GO).
--
-- ADITIVA e idempotente: crea dos tablas nuevas y no toca ninguna existente.
-- Relación comercial únicamente: no crea claves de Warp, no cobra y no activa
-- nada.
--
-- Seguridad:
-- - anon: sin ningún permiso (ni lectura, ni escritura).
-- - authenticated:
--     * INSERT solo de los campos del formulario y solo para sí mismo
--       (user_id = auth.uid()); `status` siempre nace en 'solicitud' (default)
--       y no puede elegirse; `internal_notes` no es insertable.
--     * SELECT de sus propias filas, sin la columna `internal_notes`
--       (permiso por columna: un usuario nunca puede leer notas internas,
--       ni siquiera por la API directa de Supabase).
--     * UPDATE solo de `status` e `internal_notes` y solo si es admin
--       (app_metadata.role = 'admin', que solo escribe el Admin API).
--     * Sin DELETE.
-- - El panel admin de Rifex opera en el servidor (resolveAdmin + service
--   role), nunca desde el navegador.
-- - Historial de cambios: tabla aparte, sin permisos para anon ni
--   authenticated (solo servidor).
-- - Un usuario no puede tener dos solicitudes activas para el mismo dominio
--   (índice único parcial; 'cancelado' e 'incompatible' no cuentan).
--
-- Rollback: db/rollback/2026-11-24a_warp_pilot_requests_rollback.sql
-- Verificación de solo lectura: db/checks/2026-11-24a_warp_pilot_requests_check.sql

create table if not exists public.warp_pilot_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_name text not null,
  domain text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  site_type text not null,
  objective text not null,
  authorized_information text not null,
  estimated_traffic text,
  status text not null default 'solicitud',
  terms_accepted_at timestamptz not null,
  compatibility_accepted_at timestamptz not null,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warp_pilot_requests_company_len check (char_length(company_name) between 2 and 120),
  constraint warp_pilot_requests_domain_format check (
    char_length(domain) between 4 and 253
    and domain = lower(domain)
    and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$'
  ),
  constraint warp_pilot_requests_contact_name_len check (char_length(contact_name) between 2 and 120),
  constraint warp_pilot_requests_contact_email_format check (
    char_length(contact_email) <= 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint warp_pilot_requests_contact_phone_format check (
    contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{7,20}$'
  ),
  constraint warp_pilot_requests_site_type check (
    site_type in ('nextjs_react', 'wordpress', 'php_tradicional', 'plataforma_personalizada', 'no_lo_se')
  ),
  constraint warp_pilot_requests_objective_len check (char_length(objective) between 10 and 1000),
  constraint warp_pilot_requests_authorized_info_len check (char_length(authorized_information) between 10 and 2000),
  constraint warp_pilot_requests_traffic check (
    estimated_traffic is null or estimated_traffic in ('menos_1000', '1000_10000', '10000_50000', 'mas_50000')
  ),
  constraint warp_pilot_requests_status check (
    status in ('solicitud', 'revision', 'compatible', 'pendiente_pago', 'pagado', 'configuracion',
               'pruebas', 'activo', 'pausado', 'cancelado', 'incompatible')
  ),
  constraint warp_pilot_requests_notes_len check (internal_notes is null or char_length(internal_notes) <= 4000)
);

create index if not exists warp_pilot_requests_user_id_idx on public.warp_pilot_requests (user_id);
create index if not exists warp_pilot_requests_domain_idx on public.warp_pilot_requests (domain);
create index if not exists warp_pilot_requests_status_idx on public.warp_pilot_requests (status);
create index if not exists warp_pilot_requests_created_at_idx on public.warp_pilot_requests (created_at desc);
create unique index if not exists warp_pilot_requests_one_active_per_domain
  on public.warp_pilot_requests (user_id, domain)
  where status not in ('cancelado', 'incompatible');

drop trigger if exists warp_pilot_requests_set_updated_at on public.warp_pilot_requests;
create trigger warp_pilot_requests_set_updated_at
  before update on public.warp_pilot_requests
  for each row execute function public.set_updated_at();

create table if not exists public.warp_pilot_request_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.warp_pilot_requests (id) on delete cascade,
  changed_by uuid,
  from_status text,
  to_status text,
  notes_changed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists warp_pilot_request_history_request_idx
  on public.warp_pilot_request_history (request_id, created_at desc);

-- Permisos: Supabase concede por defecto todo a anon y authenticated en
-- tablas nuevas de public; se revoca y se concede solo lo necesario.
revoke all on table public.warp_pilot_requests from public, anon, authenticated;
revoke all on table public.warp_pilot_request_history from public, anon, authenticated;
revoke all on sequence public.warp_pilot_request_history_id_seq from public, anon, authenticated;

grant select (id, user_id, company_name, domain, contact_name, contact_email, contact_phone, site_type,
              objective, authorized_information, estimated_traffic, status, terms_accepted_at,
              compatibility_accepted_at, created_at, updated_at)
  on public.warp_pilot_requests to authenticated;
grant insert (user_id, company_name, domain, contact_name, contact_email, contact_phone, site_type,
              objective, authorized_information, estimated_traffic, terms_accepted_at,
              compatibility_accepted_at)
  on public.warp_pilot_requests to authenticated;
grant update (status, internal_notes) on public.warp_pilot_requests to authenticated;

grant all on table public.warp_pilot_requests to service_role;
grant all on table public.warp_pilot_request_history to service_role;
grant usage, select on sequence public.warp_pilot_request_history_id_seq to service_role;

alter table public.warp_pilot_requests enable row level security;
alter table public.warp_pilot_request_history enable row level security;

drop policy if exists warp_pilot_requests_select_own on public.warp_pilot_requests;
create policy warp_pilot_requests_select_own on public.warp_pilot_requests
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists warp_pilot_requests_select_admin on public.warp_pilot_requests;
create policy warp_pilot_requests_select_admin on public.warp_pilot_requests
  for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');

drop policy if exists warp_pilot_requests_insert_own on public.warp_pilot_requests;
create policy warp_pilot_requests_insert_own on public.warp_pilot_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'solicitud' and internal_notes is null);

drop policy if exists warp_pilot_requests_update_admin on public.warp_pilot_requests;
create policy warp_pilot_requests_update_admin on public.warp_pilot_requests
  for update to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin')
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');

-- Sin políticas para anon ni para DELETE: denegado por defecto con RLS.
-- warp_pilot_request_history: RLS activo y sin políticas → solo service_role.
