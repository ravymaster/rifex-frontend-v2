// src/pages/api/events/orders/[token].js
// EVENT-2 (Fase 18) — recuperación de orden para comprador guest. El único
// credencial válido es el access_token opaco (48 hex chars) generado por
// create_event_order — nunca el order_id solo, nunca el email. GET público
// (sin auth.getUser(), el comprador no tiene cuenta), pero el token exige
// coincidencia exacta contra la fila real, no es adivinable/enumerable.
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const { token } = req.query || {};
  if (!token || typeof token !== "string" || token.length < 32) {
    return res.status(400).json({ ok: false, error: "invalid_token" });
  }

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `events-order-lookup:${ip}`, maxHits: 30, windowSeconds: 60 })) return;

  try {
    const { data: order, error } = await supabase
      .from("event_orders")
      .select("id, event_id, status, currency, subtotal_cents, platform_fee_cents, total_cents, paid_at, reservation_expires_at, created_at")
      .eq("access_token", token)
      .maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ ok: false, error: "order_not_found" });

    const { data: items, error: itErr } = await supabase
      .from("event_order_items")
      .select("ticket_type_name_snapshot, quantity, unit_price_cents, line_total_cents")
      .eq("order_id", order.id);
    if (itErr) throw itErr;

    const { data: event } = await supabase
      .from("events")
      .select("id, title, starts_at, ends_at, timezone, venue_name")
      .eq("id", order.event_id)
      .maybeSingle();

    return res.status(200).json({ ok: true, order, items: items || [], event: event || null });
  } catch (e) {
    console.error("[api/events/orders/[token]] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
