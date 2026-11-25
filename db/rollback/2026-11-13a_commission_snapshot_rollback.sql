-- db/rollback/2026-11-13a_commission_snapshot_rollback.sql
-- Rollback del snapshot de comisión. NO borra columnas ni snapshots válidos
-- como respuesta inmediata.
--
-- 1) Código: revertir el merge en develop (el código anterior vuelve a
--    create_event_order, que sigue intacta). Las columnas admiten NULL, así
--    que el código anterior funciona con ellas presentes.
-- 2) Tarifa: quitar RIFEX_COMMISSION_MODE en Vercel y redesplegar.
-- 3) Revertir SOLO el backfill (si fuera necesario), con los mismos ids:
update public.event_orders
set platform_fee_bps = null, commission_policy = null
where id in (:ids)
  and platform_fee_bps = 700
  and commission_policy = 'standard';
-- 4) Solo con decisión explícita y después de revertir el código:
--    drop function public.create_event_order_v2(uuid, jsonb, text, text, integer, text, integer);
--    Las columnas se conservan; eliminarlas requiere otra decisión.
