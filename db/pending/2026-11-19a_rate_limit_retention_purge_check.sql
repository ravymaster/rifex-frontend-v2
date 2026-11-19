-- Solo lectura. Conteos agregados de public.rate_limit_hits, antes o
-- después de 2026-11-19a_rate_limit_retention_purge.sql. Nunca devuelve
-- claves ni IP.
select
  count(*)                                                                as total,
  count(*) filter (where window_start <  now() - interval '48 hours')     as vencidas_48h,
  count(*) filter (where key like 'warp-pilot-%:ip:%')                     as warp_pilot_ip,
  count(*) filter (where key like 'warp-pilot-chat:ip:%')                  as warp_pilot_chat_ip,
  count(*) filter (where key like 'warp-pilot-actions:ip:%')               as warp_pilot_actions_ip,
  count(*) filter (where key like 'warp-pilot-%:h:%')                      as warp_pilot_hmac,
  count(*) filter (where key like 'warp-pilot-%:h:%'
                     and key !~ '^warp-pilot-(chat|actions):h:[0-9a-f]{32}$') as warp_pilot_hmac_malformadas
from public.rate_limit_hits;
