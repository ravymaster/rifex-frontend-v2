-- db/migrations/2026-11-08a_raffles_share_token.sql
-- Enlace compartible neutral para Rifas: cada Rifa tiene un token público
-- de compartición (`share_token`) usado en /c/<token>.
--
-- Token: 16 bytes aleatorios (128 bits) de pgcrypto, en base64url sin
-- relleno (22 caracteres). No se deriva del título, slug, creador ni id
-- interno. Único (índice), obligatorio e inmutable (trigger). Las Rifas
-- existentes reciben uno en esta migración y las nuevas lo reciben por
-- defecto al insertarse, sin cambios en el código de creación.
--
-- La columna no se otorga a los roles de cliente: no es legible por la
-- API directa de la base, solo desde el servidor.
--
-- Aditiva e idempotente. Reversión:
-- db/rollback/2026-11-08a_raffles_share_token_rollback.sql.
-- Verificación: db/checks/2026-11-08a_raffles_share_token_check.sql.

begin;

create or replace function public.new_raffle_share_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');
$$;

revoke all on function public.new_raffle_share_token() from public, anon, authenticated;

alter table public.raffles add column if not exists share_token text;

update public.raffles
   set share_token = public.new_raffle_share_token()
 where share_token is null;

alter table public.raffles alter column share_token set default public.new_raffle_share_token();
alter table public.raffles alter column share_token set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.raffles'::regclass and conname = 'raffles_share_token_format'
  ) then
    alter table public.raffles
      add constraint raffles_share_token_format check (share_token ~ '^[A-Za-z0-9_-]{22}$');
  end if;
end $$;

create unique index if not exists raffles_share_token_key on public.raffles (share_token);

create or replace function public.raffles_share_token_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.share_token is distinct from old.share_token then
    raise exception 'share_token is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.raffles_share_token_immutable() from public, anon, authenticated;

drop trigger if exists raffles_share_token_immutable on public.raffles;
create trigger raffles_share_token_immutable
  before update of share_token on public.raffles
  for each row execute function public.raffles_share_token_immutable();

revoke select (share_token) on table public.raffles from anon, authenticated;

commit;
