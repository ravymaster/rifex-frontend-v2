// src/pages/api/checkout/webhook-events.js
// EVENT-2 (Fase 11-13) — hermano de checkout/webhook.js y
// checkout/webhook-colecta.js: mismo principio no negociable, nunca se
// confía en el body del webhook, todo lo que decide un estado financiero
// sale de volver a consultar el pago real en la API de Mercado Pago.
// Archivo propio (no se toca webhook.js ni webhook-colecta.js) — mismo
// patrón sibling-file ya usado dos veces en este repo.
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { ensureEventOrderFulfilled } from "@/lib/eventFulfillment";

export const config = { api: { bodyParser: false }, runtime: "nodejs" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    req.on("data", (chunk) => (data = Buffer.concat([data, chunk])));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function parseMaybeFormUrlEncoded(rawBuf) {
  const txt = rawBuf.toString("utf8");
  const kv = Object.fromEntries(
    txt.split("&").map((p) => {
      const [k, v] = p.split("=");
      return [decodeURIComponent(k || ""), decodeURIComponent(v || "")];
    })
  );
  return kv;
}

function safeJsonParse(buf) {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

function buildEventId(req, paymentId) {
  const reqId = String(req.headers["x-request-id"] || "");
  const ts = Date.now();
  return `evw_${paymentId || "noid"}_${reqId || "noreqid"}_${ts}`;
}

function mask(val, keep = 6) {
  const s = String(val || "");
  if (s.length <= keep) return s;
  return `${s.slice(0, keep)}…(${s.length})`;
}

async function fetchPayment(paymentId, hintMpUserId = null) {
  const platformToken = process.env.MP_ACCESS_TOKEN || null;
  let platformFail = null;
  if (platformToken) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (r.ok) return { ok: true, json: await r.json(), via: "platform" };
    platformFail = { status: r.status, json: await r.json().catch(() => ({})) };
  }
  if (hintMpUserId) {
    const { data: candidates } = await supabase
      .from("merchant_gateways")
      .select("access_token")
      .eq("mp_user_id", String(hintMpUserId))
      .eq("provider", "mp")
      .limit(10);

    let lastSellerFail = null;
    for (const gw of candidates || []) {
      const sellerToken = gw?.access_token || null;
      if (!sellerToken) continue;
      const r2 = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${sellerToken}` },
      });
      if (r2.ok) return { ok: true, json: await r2.json(), via: "seller" };
      lastSellerFail = { status: r2.status, json: await r2.json().catch(() => ({})) };
    }
    if (lastSellerFail) return { ok: false, status: lastSellerFail.status, json: lastSellerFail.json, via: "seller" };
  }
  if (platformFail) return { ok: false, status: platformFail.status, json: platformFail.json, via: "platform" };
  return { ok: false, status: 401, json: { error: "no_token_available" }, via: "none" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  let raw = null;
  let eventId = null;

  try {
    raw = await readRawBody(req);
  } catch (e) {
    console.error("[events webhook] raw body error", e);
    return res.status(200).json({ ok: false, error: "raw_body_error" });
  }

  try {
    const h = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)])
    );
    delete h.authorization;
    console.log("[events webhook] HEADERS:", h);
    console.log("[events webhook] RAW:", mask(raw.toString("utf8"), 512));

    let body = safeJsonParse(raw);
    if (!body) {
      try {
        body = parseMaybeFormUrlEncoded(raw);
      } catch (e) {
        console.error("[events webhook] body parse error", e);
        return res.status(200).json({ ok: false, error: "invalid_body" });
      }
    }

    const paymentId =
      body?.data?.id || body?.id || body?.resource?.id ||
      (typeof body?.data === "string" ? body.data : null);

    if (!paymentId) {
      console.log("[events webhook] no payment id in payload");
      return res.status(200).json({ ok: true, msg: "no_payment_id" });
    }

    eventId = buildEventId(req, paymentId);

    // ==== Validación de firma — fail-closed si hay secreto configurado
    // (mismo criterio ya endurecido en checkout/webhook.js, PRE-LAUNCH-FIX-2
    // P2-B: ausencia de firma/request-id con secreto configurado rechaza,
    // nunca se salta en silencio). ====
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers["x-signature"];
      const reqIdHeader = req.headers["x-request-id"];
      if (!signature || !reqIdHeader) {
        console.error("[events webhook] secret configurado pero falta x-signature/x-request-id — rechazado", { eventId });
        return res.status(401).json({ ok: false, error: "missing_signature" });
      }
      try {
        const parts = Object.fromEntries(
          String(signature).split(",").map((kv) => kv.trim().split("="))
        );
        const signed = `id:${paymentId};request-id:${reqIdHeader};ts:${parts.ts};`;
        const digest = crypto.createHmac("sha256", secret).update(signed).digest("hex");
        if (digest !== parts.v1) {
          console.error("[events webhook] firma inválida — rechazado", { eventId });
          return res.status(401).json({ ok: false, error: "invalid_signature" });
        }
      } catch (e) {
        console.error("[events webhook] error parseando firma — rechazado", { eventId, err: e?.message || e });
        return res.status(401).json({ ok: false, error: "invalid_signature" });
      }
    }
    // Nota (misma decisión documentada que webhook.js): sin rate limiting
    // acá — el emisor es infraestructura de MP, no un cliente final, y el
    // estado/monto siempre se re-verifica contra la API real.

    const hintMpUserId = body?.user_id || body?.account_id || body?.collector_id || body?.owner_id || null;

    const fetched = await fetchPayment(paymentId, hintMpUserId);
    if (!fetched.ok) {
      console.warn("[events webhook] cannot fetch payment", { eventId, status: fetched.status, via: fetched.via });
      return res.status(200).json({ ok: false, error: "fetch_payment_failed" });
    }

    const mp = fetched.json;
    const mpStatus = String(mp?.status || "").toLowerCase();

    try {
      await supabase.from("webhook_events").upsert(
        {
          event_type: `events.${body?.type || body?.action || "unknown"}`,
          payment_id: String(paymentId),
          live_mode: typeof mp?.live_mode === "boolean" ? mp.live_mode : null,
          payload: body,
          headers: h,
          event_id: eventId,
        },
        { onConflict: "event_id", ignoreDuplicates: true }
      );
    } catch (e) {
      console.error("[events webhook] webhook_events insert error", { eventId, err: e?.message || e });
    }

    // ==== Metadata REAL del pago — nunca la del body del webhook ====
    const md = mp?.metadata || {};
    if (md.product !== "event_order") {
      console.log("[events webhook] not an event_order payment, skip", { eventId, product: md.product });
      return res.status(200).json({ ok: true, skipped: true, reason: "not_event_order" });
    }
    const orderId = md.order_id || mp?.external_reference || null;
    const metaEventId = md.event_id || null;
    if (!orderId) {
      console.warn("[events webhook] metadata incompleta", { eventId, md });
      return res.status(200).json({ ok: false, error: "invalid_metadata" });
    }

    const { data: order, error: oErr } = await supabase
      .from("event_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) {
      console.warn("[events webhook] order inexistente", { eventId, orderId });
      return res.status(200).json({ ok: false, error: "order_not_found" });
    }
    if (metaEventId && order.event_id !== metaEventId) {
      console.error("[events webhook] event_id no coincide — metadata inconsistente", {
        eventId, orderId, expected: order.event_id, got: metaEventId,
      });
      return res.status(200).json({ ok: false, error: "event_mismatch" });
    }

    // Terminal: una orden ya paid/cancelled/approved_unfulfilled no se
    // vuelve a tocar por ningún evento posterior.
    if (["paid", "cancelled", "approved_unfulfilled"].includes(order.status)) {
      console.log("[events webhook] orden en estado terminal, no se toca", { eventId, orderId, status: order.status });
      return res.status(200).json({ ok: true, already_processed: true, status: order.status });
    }

    if (mpStatus !== "approved") {
      // pending/in_process/rejected/cancelled de MP: EVENT-2 no modela un
      // estado 'rejected' propio — la orden simplemente vive hasta que su
      // TTL expira (o el comprador reintenta y llega un approved real
      // después). No-op deliberado, ver informe Fase 2 ("failed" evaluado
      // y descartado para mantener la máquina de estados chica).
      return res.status(200).json({ ok: true, intermediate: true, mp_status: mpStatus });
    }

    // Monto real pagado debe calzar EXACTO con el total de la orden.
    // Moneda real pagada debe calzar EXACTO con la moneda de la orden.
    const paidAmountCents = Math.round(Number(mp?.transaction_amount || 0) * 100);
    const paidCurrency = String(mp?.currency_id || "").toUpperCase();
    if (paidAmountCents !== Number(order.total_cents)) {
      console.error("[events webhook] monto no coincide — rechazado", {
        eventId, orderId, expected: order.total_cents, got: paidAmountCents,
      });
      return res.status(200).json({ ok: false, error: "amount_mismatch" });
    }
    if (paidCurrency && paidCurrency !== String(order.currency).toUpperCase()) {
      console.error("[events webhook] moneda no coincide — rechazado", {
        eventId, orderId, expected: order.currency, got: paidCurrency,
      });
      return res.status(200).json({ ok: false, error: "currency_mismatch" });
    }

    // ==== Reconciliación atómica — pending/expired -> paid|approved_unfulfilled ====
    let updatedOrder;
    try {
      const { data, error } = await supabase
        .rpc("mark_event_order_paid", { p_order_id: orderId, p_mp_payment_id: String(paymentId) })
        .single();
      if (error) throw error;
      updatedOrder = data;
    } catch (e) {
      if (e?.code === "23505") {
        console.error("[events webhook] mp_payment_id ya usado en otra orden", { eventId, paymentId, orderId });
        return res.status(200).json({ ok: false, error: "payment_already_used" });
      }
      if (e?.message === "order_not_payable") {
        console.error("[events webhook] orden no pagable (cancelada u otro estado inesperado)", { eventId, orderId });
        return res.status(200).json({ ok: false, error: "order_not_payable" });
      }
      console.error("[events webhook] mark_event_order_paid error", { eventId, orderId, err: e?.message || e });
      return res.status(200).json({ ok: false, error: "reconcile_error" });
    }

    console.log("[events webhook] transición aplicada", {
      eventId, orderId, previousStatus: order.status, newStatus: updatedOrder.status, paymentId,
    });

    // EVENT-3 (Fase 7): emisión de tickets separada del estado de pago —
    // un fallo acá se loguea pero NUNCA cambia la respuesta 200 de este
    // webhook (el pago ya está resuelto), y se reintenta lazy cuando el
    // comprador visite su orden (ver eventFulfillment.js).
    if (updatedOrder.status === "paid") {
      try {
        await ensureEventOrderFulfilled(supabase, orderId);
      } catch (e) {
        console.error("[events webhook] ticket issuance error (retriable, payment unaffected)", { eventId, orderId, err: e?.message || e });
      }
    }

    return res.status(200).json({ ok: true, order_id: orderId, status: updatedOrder.status, eventId });
  } catch (e) {
    console.error("[events webhook] fatal error", e);
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
