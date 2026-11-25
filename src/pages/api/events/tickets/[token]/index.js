// src/pages/api/events/tickets/[token]/index.js
// EVENT-3 (Fase 12-13) — resolución pública del QR. GET únicamente, NUNCA
// consume/modifica el ticket (el escaneo NO es check-in, eso es EVENT-4).
// El qr_token es la única credencial; token inexistente -> 404 neutro, sin
// filtrar si "existió alguna vez" ni ningún otro detalle. Nunca expone
// PII del comprador, payment IDs, access_token de la orden, ni el
// order_id interno.
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
  if (!token || typeof token !== "string" || token.length < 16) {
    return res.status(400).json({ ok: false, error: "invalid_token" });
  }

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `events-ticket-resolve:${ip}`, maxHits: 30, windowSeconds: 60 })) return;

  try {
    const { data: ticket, error } = await supabase
      .from("event_tickets")
      .select("ticket_number, ticket_type_name_snapshot, status, event_id, issued_at")
      .eq("qr_token", token)
      .maybeSingle();
    if (error) throw error;
    // Fase 13: anti-enumeration — mismo 404 neutro tanto si el token nunca
    // existió como si existe pero algo más falló; nunca se distingue.
    if (!ticket) return res.status(404).json({ ok: false, error: "not_found" });

    const { data: event } = await supabase
      .from("events")
      .select("title, starts_at, ends_at, timezone, venue_name")
      .eq("id", ticket.event_id)
      .maybeSingle();

    return res.status(200).json({
      ok: true,
      ticket: {
        ticket_number: ticket.ticket_number,
        ticket_type_name: ticket.ticket_type_name_snapshot,
        status: ticket.status,
      },
      event: event
        ? { title: event.title, starts_at: event.starts_at, ends_at: event.ends_at, timezone: event.timezone, venue_name: event.venue_name }
        : null,
    });
  } catch (e) {
    console.error("[api/events/tickets/[token]] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
