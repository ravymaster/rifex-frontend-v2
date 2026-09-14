// src/pages/api/events/[id]/expire-orders.js
// EVENT-2 (Fase 21) — mecanismo de expiración de reservas: mismo patrón ya
// certificado en rifas/[id].jsx (fetch lazy al cargar la página pública +
// setInterval mientras sigue abierta), no un cron/daemon nuevo. Vercel es
// serverless y DEV no tiene scheduler automático real (el trigger
// `schedule` de GitHub Actions solo corre desde la rama default, y
// Eventos vive en develop) — se prefiere este patrón ya probado antes que
// inventar infraestructura nueva (sin Redis, sin tocar el scheduler de
// DRAW).
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const { id: eventId } = req.query || {};

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `events-expire:${ip}`, maxHits: 20, windowSeconds: 60 })) return;

  try {
    const nowIso = new Date().toISOString();
    let query = supabase
      .from("event_orders")
      .select("id")
      .eq("status", "pending")
      .lt("reservation_expires_at", nowIso)
      .limit(50);
    if (eventId) query = query.eq("event_id", eventId);

    const { data: expired, error } = await query;
    if (error) throw error;

    let releasedCount = 0;
    for (const row of expired || []) {
      try {
        const { data: didExpire } = await supabase.rpc("expire_event_order", { p_order_id: row.id, p_force: false });
        if (didExpire) releasedCount += 1;
      } catch (e) {
        console.error("[events/expire-orders] expire_event_order error", { orderId: row.id, err: e?.message || e });
      }
    }

    return res.status(200).json({ ok: true, released: releasedCount, candidates_seen: (expired || []).length });
  } catch (e) {
    console.error("[events/expire-orders] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
