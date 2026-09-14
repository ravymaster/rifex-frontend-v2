// src/pages/api/events/[id]/checkout.js
// EVENT-2 (Fase 9-10) — checkout transaccional de Eventos. Compra SIN
// cuenta (guest): nunca exige auth.getUser(), solo email de contacto.
// Nunca acepta del cliente unit_price/subtotal/platform_fee/total/
// organizer_id/currency — todo se deriva server-side dentro de la RPC
// create_event_order (atomica, ver migración 2026-08-24).
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";
import { PLATFORM_FEE_RATE } from "@/lib/platformFee";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const RESERVATION_MINUTES = 10;
const isValidEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function resolveBaseUrl(req) {
  const cfg = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (cfg) return cfg;
  const proto = (req.headers["x-forwarded-proto"] || "https") + "://";
  const host = req.headers.host || "localhost:3000";
  return `${proto}${host}`;
}

// Mapeo de errores de la RPC (siempre texto plano en `message`) a HTTP.
const RPC_ERROR_STATUS = {
  missing_buyer_email: 400,
  empty_items: 400,
  event_not_found: 404,
  event_not_sellable: 409,
  event_ended: 409,
  invalid_ticket_type_id: 400,
  invalid_quantity: 400,
  ticket_type_not_found: 400,
  ticket_type_event_mismatch: 400,
  ticket_type_not_active: 409,
  sales_not_started: 409,
  sales_ended: 409,
  exceeds_max_per_order: 400,
  insufficient_stock: 409,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const { id: eventId } = req.query || {};
  if (!eventId) return res.status(400).json({ ok: false, error: "missing_event_id" });

  // EVENT-2 (Fase 15): guest, sin user_id — se limita por IP+evento, no
  // por sesión (no existe una para un comprador sin cuenta).
  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `events-checkout:${ip}:${eventId}`, maxHits: 10, windowSeconds: 60 })) return;

  try {
    const { items, buyer_email, buyer_name } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "empty_items" });
    }
    if (items.length > 20) {
      return res.status(400).json({ ok: false, error: "too_many_items" });
    }
    const email = String(buyer_email || "").trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
    const name = buyer_name ? String(buyer_name).trim().slice(0, 120) : null;

    // Normaliza items a exactamente {ticket_type_id, quantity} — cualquier
    // otro campo que el cliente intente colar (unit_price, etc.) se
    // descarta acá, nunca llega a la RPC.
    const cleanItems = items.map((it) => ({
      ticket_type_id: String(it?.ticket_type_id || ""),
      quantity: Number(it?.quantity),
    }));
    if (cleanItems.some((it) => !it.ticket_type_id || !Number.isInteger(it.quantity) || it.quantity <= 0)) {
      return res.status(400).json({ ok: false, error: "invalid_items" });
    }

    // 1) Evento
    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("id, title, status, ends_at, organizer_id")
      .eq("id", eventId)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!event) return res.status(404).json({ ok: false, error: "event_not_found" });

    // 2) Fase 8: organizador debe tener MP conectado y vigente ANTES de
    // reservar nada — si no, no hay forma de cobrar, se corta acá.
    const { data: gw } = await supabase
      .from("merchant_gateways")
      .select("access_token, revoked_at, expires_at")
      .eq("user_id", event.organizer_id)
      .eq("provider", "mp")
      .maybeSingle();
    const sellerToken = gw?.access_token || null;
    const gwUsable = sellerToken && !gw.revoked_at && (!gw.expires_at || new Date(gw.expires_at).getTime() > Date.now());
    if (!gwUsable) {
      return res.status(400).json({ ok: false, error: "organizer_not_connected" });
    }

    // 3) Reserva atómica todo-o-nada + snapshot de precios + comisión.
    const { data: order, error: rpcErr } = await supabase.rpc("create_event_order", {
      p_event_id: eventId,
      p_items: cleanItems,
      p_buyer_email: email,
      p_buyer_name: name,
      p_platform_fee_rate: PLATFORM_FEE_RATE,
      p_reservation_minutes: RESERVATION_MINUTES,
    }).single();

    if (rpcErr) {
      const known = RPC_ERROR_STATUS[rpcErr.message];
      if (known) return res.status(known).json({ ok: false, error: rpcErr.message });
      console.error("[events/checkout] create_event_order error", rpcErr);
      return res.status(500).json({ ok: false, error: "order_creation_failed" });
    }

    // 4) Preference de MP con el token real del organizador (marketplace,
    // nunca se recibe el dinero en una cuenta Rifex primero).
    const base = resolveBaseUrl(req);
    const notificationUrl = `${base}/api/checkout/webhook-events`;

    const mpClient = new MercadoPagoConfig({ accessToken: sellerToken });
    const preference = new Preference(mpClient);

    const totalCLP = Math.round(Number(order.total_cents) / 100);
    const feeCLP = Math.round(Number(order.platform_fee_cents) / 100);
    const cleanTitle = `Entradas — ${String(event.title || "Evento").slice(0, 50)}`;

    const prefBody = {
      items: [{ title: cleanTitle, quantity: 1, unit_price: totalCLP, currency_id: order.currency || "CLP" }],
      marketplace_fee: feeCLP,
      payer: { email, name: name || undefined },
      back_urls: {
        success: `${base}/eventos/pago/exito?order=${order.id}&token=${order.access_token}`,
        failure: `${base}/eventos/pago/error?order=${order.id}&token=${order.access_token}`,
        pending: `${base}/eventos/pago/pendiente?order=${order.id}&token=${order.access_token}`,
      },
      auto_return: "approved",
      binary_mode: true,
      external_reference: String(order.id),
      notification_url: notificationUrl,
      statement_descriptor: "RIFEX",
      metadata: {
        product: "event_order",
        event_id: String(eventId),
        order_id: String(order.id),
      },
    };

    let prefRes;
    try {
      prefRes = await preference.create({ body: prefBody });
    } catch (e) {
      console.error("[events/checkout] preference.create error", e?.message || e);
      // Fase 10: si la preference falla, NUNCA dejar el inventario
      // secuestrado hasta el TTL natural — se libera de inmediato.
      try {
        await supabase.rpc("expire_event_order", { p_order_id: order.id, p_force: true });
      } catch (e2) {
        console.error("[events/checkout] compensating expire_event_order failed", e2?.message || e2);
      }
      return res.status(500).json({ ok: false, error: "mp_preference_failed" });
    }

    const mpPreferenceId = prefRes?.id || prefRes?.body?.id || null;
    const initPoint =
      prefRes?.init_point || prefRes?.body?.init_point ||
      prefRes?.sandbox_init_point || prefRes?.body?.sandbox_init_point || null;

    if (!initPoint) {
      console.error("[events/checkout] missing init_point", prefRes);
      try {
        await supabase.rpc("expire_event_order", { p_order_id: order.id, p_force: true });
      } catch (e2) {
        console.error("[events/checkout] compensating expire_event_order failed", e2?.message || e2);
      }
      return res.status(500).json({ ok: false, error: "no_init_point" });
    }

    if (mpPreferenceId) {
      await supabase.from("event_orders").update({ mp_preference_id: mpPreferenceId }).eq("id", order.id);
    }

    return res.status(200).json({
      ok: true,
      url: initPoint,
      init_point: initPoint,
      order_id: order.id,
      access_token: order.access_token,
      reservation_expires_at: order.reservation_expires_at,
      total_cents: order.total_cents,
    });
  } catch (e) {
    console.error("[events/checkout] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
