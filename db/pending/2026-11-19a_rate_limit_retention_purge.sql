-- =====================================================================
-- PREPARADA — NO EJECUTAR SIN GO EXPLÍCITO.
-- Limpieza única de public.rate_limit_hits (Rifex DEV primero).
--
-- Qué hace (una sola transacción):
--   1. Borra las filas vencidas: window_start anterior a now() - 48 horas.
--      La ventana más larga en uso es de 3600 s (contacto, reportar); 48 h
--      es más de 40 veces esa ventana, así que ninguna fila borrada puede
--      seguir contando para un límite activo.
--   2. Borra una sola vez las claves antiguas del asistente con IP en claro
--      (warp-pilot-chat:ip:* y warp-pilot-actions:ip:*). Desde el cambio a
--      claves HMAC (warp-pilot-<scope>:h:<32 hex>) ya no se crean.
--
-- Privacidad: solo muestra conteos agregados antes y después. Nunca
-- selecciona, imprime ni respalda claves ni IP.
--
-- Comprobaciones: si después del borrado queda alguna clave antigua del
-- asistente o alguna fila vencida, o si se borró alguna fila vigente que
-- no sea del asistente, la transacción aborta con RAISE EXCEPTION y no se
-- aplica nada.
--
-- Rollback:
--   - Antes de COMMIT: cualquier error aborta todo (ROLLBACK automático).
--     Para revisar sin aplicar, cambie el COMMIT final por ROLLBACK.
--   - Después de COMMIT: no hay respaldo, a propósito (respaldar sería
--     copiar las IP). Las filas son contadores efímeros: borrarlas solo
--     reinicia contadores, como mucho una ventana extra de cupo para quien
--     tuviera una clave antigua vigente. No hay que restaurar nada.
-- =====================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Corte fijo para toda la transacción.
create temp table _rl_cutoff on commit drop as
  select now() - interval '48 hours' as cutoff;

-- Antes (solo conteos).
create temp table _rl_before on commit drop as
select
  count(*)                                                              as total,
  count(*) filter (where window_start <  (select cutoff from _rl_cutoff)) as vencidas,
  count(*) filter (where key like 'warp-pilot-%:ip:%')                   as warp_pilot_ip,
  count(*) filter (where key like 'warp-pilot-%:ip:%'
                     and window_start >= (select cutoff from _rl_cutoff)) as warp_pilot_ip_vigentes,
  count(*) filter (where key not like 'warp-pilot-%:ip:%'
                     and window_start >= (select cutoff from _rl_cutoff)) as otras_vigentes
from public.rate_limit_hits;
select 'antes' as fase, * from _rl_before;

-- 1. Filas vencidas (todos los consumidores).
with borradas as (
  delete from public.rate_limit_hits
  where window_start < (select cutoff from _rl_cutoff)
  returning 1
)
select 'vencidas_borradas' as paso, count(*) as filas from borradas;

-- 2. Claves antiguas del asistente con IP en claro (las que sigan vigentes).
with borradas as (
  delete from public.rate_limit_hits
  where key like 'warp-pilot-%:ip:%'
  returning 1
)
select 'warp_pilot_ip_borradas' as paso, count(*) as filas from borradas;

-- Comprobaciones.
do $$
declare
  v_otras_antes bigint;
  v_otras_despues bigint;
begin
  if exists (select 1 from public.rate_limit_hits where key like 'warp-pilot-%:ip:%') then
    raise exception 'quedan claves warp-pilot con IP en claro';
  end if;
  if exists (select 1 from public.rate_limit_hits where window_start < (select cutoff from _rl_cutoff)) then
    raise exception 'quedan filas vencidas';
  end if;
  select otras_vigentes into v_otras_antes from _rl_before;
  select count(*) into v_otras_despues from public.rate_limit_hits
    where key not like 'warp-pilot-%:ip:%' and window_start >= (select cutoff from _rl_cutoff);
  -- Las filas vigentes ajenas al asistente no se tocan (pueden crecer por
  -- tráfico concurrente, nunca disminuir).
  if v_otras_despues < v_otras_antes then
    raise exception 'se borraron filas vigentes que no son del asistente';
  end if;
end $$;

-- Después (solo conteos).
select
  'después' as fase,
  count(*)                                                        as total,
  count(*) filter (where window_start < (select cutoff from _rl_cutoff)) as vencidas,
  count(*) filter (where key like 'warp-pilot-%:ip:%')             as warp_pilot_ip,
  count(*) filter (where key like 'warp-pilot-%:h:%')              as warp_pilot_hmac
from public.rate_limit_hits;

commit;
