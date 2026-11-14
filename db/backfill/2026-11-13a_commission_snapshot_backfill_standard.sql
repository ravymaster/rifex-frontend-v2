-- db/backfill/2026-11-13a_commission_snapshot_backfill_standard.sql
-- Backfill SOLO de operaciones demostrablemente al 7 % (700 pb, standard):
-- la comisión guardada es exactamente floor(bruto * 700 / 10000) y NO
-- coincide con 1 %. Solo escribe las dos columnas nuevas; no toca montos,
-- estado ni fechas (event_orders y colecta_contributions no tienen trigger
-- de updated_at). Filas ambiguas o que no calzan quedan en NULL.
-- Aplicar con la lista de ids auditada en el ambiente; en DEV fueron 4
-- órdenes de Eventos y 0 aportes de Campañas.
update public.event_orders
set platform_fee_bps = 700, commission_policy = 'standard'
where platform_fee_bps is null
  and commission_policy is null
  and subtotal_cents > 0
  and platform_fee_cents = least(subtotal_cents, (subtotal_cents * 700) / 10000)
  and platform_fee_cents <> least(subtotal_cents, (subtotal_cents * 100) / 10000)
  and id in (:ids);
