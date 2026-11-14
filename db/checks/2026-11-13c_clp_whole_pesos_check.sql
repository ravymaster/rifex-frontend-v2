-- db/checks/2026-11-13c_clp_whole_pesos_check.sql
-- Auditoría de solo lectura antes de aplicar 2026-11-13c: 'frac' debe ser 0 en todas las filas.
select 'event_ticket_types.price_cents' c, count(*) total, count(*) filter (where price_cents % 100 <> 0) frac, count(*) filter (where price_cents < 0) neg, min(price_cents) mn, max(price_cents) mx from event_ticket_types
union all select 'event_orders.subtotal_cents', count(*), count(*) filter (where subtotal_cents % 100 <> 0), count(*) filter (where subtotal_cents < 0), min(subtotal_cents), max(subtotal_cents) from event_orders
union all select 'event_orders.total_cents', count(*), count(*) filter (where total_cents % 100 <> 0), 0, min(total_cents), max(total_cents) from event_orders
union all select 'event_orders.platform_fee_cents', count(*), count(*) filter (where platform_fee_cents % 100 <> 0), 0, min(platform_fee_cents), max(platform_fee_cents) from event_orders
union all select 'event_order_items.unit_price_cents', count(*), count(*) filter (where unit_price_cents % 100 <> 0), 0, min(unit_price_cents), max(unit_price_cents) from event_order_items
union all select 'event_order_items.line_total_cents', count(*), count(*) filter (where line_total_cents % 100 <> 0), 0, min(line_total_cents), max(line_total_cents) from event_order_items
union all select 'colectas.goal_cents', count(*), count(*) filter (where goal_cents % 100 <> 0), count(*) filter (where goal_cents <= 0), min(goal_cents), max(goal_cents) from colectas
union all select 'colecta_contributions.amount_cents', count(*), count(*) filter (where amount_cents % 100 <> 0), 0, min(amount_cents), max(amount_cents) from colecta_contributions
union all select 'colecta_contributions.marketplace_fee_cents', count(*), count(*) filter (where marketplace_fee_cents % 100 <> 0), 0, min(marketplace_fee_cents), max(marketplace_fee_cents) from colecta_contributions
;
