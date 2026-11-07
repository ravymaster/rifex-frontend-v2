-- db/rollback/2026-11-08a_raffles_share_token_rollback.sql
-- Reversión de db/migrations/2026-11-08a_raffles_share_token.sql.
-- Atención: elimina los tokens emitidos; los enlaces /c/<token> ya
-- compartidos dejan de resolver. Aplicar solo antes de compartir enlaces
-- o junto con la reversión del código que los usa.

begin;

drop trigger if exists raffles_share_token_immutable on public.raffles;
drop function if exists public.raffles_share_token_immutable();
drop index if exists public.raffles_share_token_key;
alter table public.raffles drop constraint if exists raffles_share_token_format;
alter table public.raffles drop column if exists share_token;
drop function if exists public.new_raffle_share_token();

commit;
