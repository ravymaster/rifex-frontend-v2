// src/pages/api/checkout/webhook.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

// ==== Runtime + raw body ====
export const config = { api: { bodyParser: false }, runtime: "nodejs" };

// ==== Supabase (service role si está disponible) ====
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

// === Helpers ===
const isValidEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

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
  return `mpw_${paymentId || "noid"}_${reqId || "noreqid"}_${ts}`;
}

function mask(val, keep = 6) {
  const s = String(val || "");
  if (s.length <= keep) return s;
  return `${s.slice(0, keep)}…(${s.length})`;
}

// Guarda el evento crudo en DB (para auditoría)
async function logWebhookEvent(
  supabaseClient,
  { provider = "mercadopago", event_type = null, payment_id = null, live_mode = null, payload = null, headers = null }
) {
  try {
    await supabaseClient.from("webhook_events").insert({
      provider,
      event_type,
      payment_id,
      live_mode,
      payload,
      headers,
    });
  } catch (e) {
    console.warn("[mp webhook] logWebhookEvent failed:", e?.message || e);
  }
}

/** Firma MP: helpers estrictos */
function parseMpSignature(signatureHeader) {
  if (!signatureHeader) return null;
  const obj = {};
  String(signatureHeader)
    .split(",")
    .forEach((pair) => {
      const [k, v] = pair.trim().split("=");
      if (k && v) obj[k] = v;
    });
  return obj; // { ts: "...", v1: "..." }
}

function verifyMpSignature({ reqId, signatureHeader, secret, windowSeconds = 300 }) {
  if (!secret || !signatureHeader) return { ok: false, reason: "missing_secret_or_sig" };
  const parts = parseMpSignature(signatureHeader);
  if (!parts || !parts.ts || !parts.v1) return { ok: false, reason: "bad_sig_format" };

  const ts = Number(parts.ts);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_ts" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > windowSeconds) return { ok: false, reason: "ts_out_of_window" }; // replay window

  const signed = `id:${reqId || ""};ts:${parts.ts};`;
  const digest = crypto.createHmac("sha256", secret).update(signed).digest("hex");

  try {
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(parts.v1, "hex");
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, reason: ok ? "ok" : "hmac_mismatch" };
  } catch {
    return { ok: false, reason: "compare_error" };
  }
}

async function fetchPayment(paymentId, hintMpUserId = null) {
  // 1) Intento con token plataforma
  const platformToken = process.env.MP_ACCESS_TOKEN || null;
  if (platformToken) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (r.ok) return { ok: true, json: await r.json(), via: "platform" };
    if (![401, 403].includes(r.status)) {
      return { ok: false, status: r.status, json: await r.json().catch(() => ({})), via: "platform" };
    }
  }

  // 2) Fallback: probar token del vendedor si conocemos mp_user_id
  if (hintMpUserId) {
    const { data: gw } = await supabase
      .from("merchant_gateways")
      .select("access_token, mp_user_id")
      .eq("mp_user_id", String(hintMpUserId))
      .eq("provider", "mp")
      .maybeSingle();

    const sellerToken = gw?.access_token || null;
    if (sellerToken) {
      const r2 = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${sellerToken}` },
      });
      if (r2.ok) return { ok: true, json: await r2.json(), via: "seller" };
      return { ok: false, status: r2.status, json: await r2.json().catch(() => ({})), via: "seller" };
    }
  }

  return { ok: false, status: 401, json: { error: "no_token_available" }, via: "none" };
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  let raw = null;
  let eventId = null;

  try {
    raw = await readRawBody(req);
  } catch (e) {
    console.error("[mp webhook] raw body error", e);
    // 200 para que MP no reintente infinito
    return res.status(200).json({ ok: false, error: "raw_body_error" });
  }

  try {
    // ==== Logs base (headers + raw) ====
    const h = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)])
    );
    delete h.authorization; // nunca loguear tokens
    console.log("[mp webhook] HEADERS:", h);
    console.log("[mp webhook] RAW:", mask(raw.toString("utf8"), 512));

    // ==== Parse preliminar para log ====
    let preBody = safeJsonParse(raw);
    if (!preBody) {
      try { preBody = parseMaybeFormUrlEncoded(raw); } catch {}
    }
    const prePaymentId =
      preBody?.data?.id ||
      preBody?.id ||
      preBody?.resource?.id ||
      (typeof preBody?.data === "string" ? preBody.data : null);
    await logWebhookEvent(supabase, {
      provider: "mercadopago",
      event_type: preBody?.type || preBody?.action || null,
      payment_id: prePaymentId ? String(prePaymentId) : null,
      live_mode: typeof preBody?.live_mode === "boolean" ? preBody.live_mode : null,
      payload: preBody || {},
      headers: h,
    });

    // ==== Verificación de firma (ESTRICTO en producción) ====
    const secret = process.env.MP_WEBHOOK_SECRET || "";
    const signature = String(req.headers["x-signature"] || "");
    const reqId = String(req.headers["x-request-id"] || "");
    const { ok: sigOK, reason } = verifyMpSignature({
      reqId,
      signatureHeader: signature,
      secret,
      windowSeconds: 300, // 5 minutos
    });
    if (!sigOK) {
      console.warn("[mp webhook] invalid signature:", reason);
      // rechazamos para evitar replays / inyecciones
      return res.status(400).json({ ok: false, error: "invalid_signature" });
    }

    // ==== Parse del cuerpo final ====
    let body = safeJsonParse(raw);
    if (!body) {
      try {
        body = parseMaybeFormUrlEncoded(raw);
      } catch (e) {
        console.error("[mp webhook] body parse error", e);
        return res.status(200).json({ ok: false, error: "invalid_body" });
      }
    }

    // Campos habituales en webhook MP
    const paymentId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.id ||
      (typeof body?.data === "string" ? body.data : null);

    // Eventos que no son de pago
    if (!paymentId) {
      console.log("[mp webhook] no payment id in payload");
      return res.status(200).json({ ok: true, msg: "no_payment_id" });
    }

    eventId = buildEventId(req, paymentId);

    // Hint de mp_user_id/collector para probar token del vendedor
    const hintMpUserId =
      body?.user_id || body?.account_id || body?.collector_id || body?.owner_id || null;

    // ==== Traer el pago desde MP ====
    const fetched = await fetchPayment(paymentId, hintMpUserId);
    if (!fetched.ok) {
      console.warn("[mp webhook] cannot fetch payment", {
        eventId,
        status: fetched.status,
        via: fetched.via,
        body: fetched.json,
      });
      return res.status(200).json({ ok: false, error: "fetch_payment_failed" });
    }

    const mp = fetched.json;
    const status = String(mp?.status || "").toLowerCase();
    const status_detail = mp?.status_detail || null;
    const md = mp?.metadata || {};

    // Referencias/metadata
    let purchaseId = md.purchase_id || mp?.external_reference || null;
    if (purchaseId && typeof purchaseId !== "string") purchaseId = String(purchaseId);
    let raffleId = md.raffle_id || md.raffleId || md.rid || null;

    // numbers desde metadata (si vinieran)
    let numbers = [];
    if (Array.isArray(md.numbers)) numbers = md.numbers;
    else if (typeof md.numbers === "string") {
      numbers = md.numbers
        .split(",")
        .map((s) => parseInt(String(s).trim(), 10))
        .filter((n) => Number.isFinite(n));
    }

    // fallback: completar datos desde purchases
    let buyer_email = (md.buyer_email || mp?.payer?.email || "").trim().toLowerCase();
    let buyer_name = (md.buyer_name || mp?.payer?.first_name || "").toString().trim();

    if (!raffleId || !numbers.length || !isValidEmail(buyer_email)) {
      if (purchaseId) {
        const { data: pRow } = await supabase
          .from("purchases")
          .select("raffle_id, numbers, buyer_email, buyer_name")
          .eq("id", purchaseId)
          .maybeSingle();
        if (pRow) {
          if (!raffleId && pRow.raffle_id) raffleId = pRow.raffle_id;
          if (!numbers.length && Array.isArray(pRow.numbers)) numbers = pRow.numbers;
          if (!isValidEmail(buyer_email) && isValidEmail(pRow.buyer_email)) {
            buyer_email = pRow.buyer_email.trim().toLowerCase();
          }
          if (!buyer_name && pRow.buyer_name) buyer_name = String(pRow.buyer_name).trim();
        }
      }
    }

    const amount_cents = Math.round(Number(mp?.transaction_amount || 0) * 100);
    const mpIdStr = String(mp?.id || paymentId);
    const isLive = !!(mp && mp.live_mode === true); // <- pago real (producción)

    // ==== Upsert en payments (idempotente) ====
    const { data: payRow, error: payErr } = await supabase
      .from("payments")
      .upsert(
        {
          mp_payment_id: mpIdStr,
          raffle_id: raffleId || null,
          purchase_id: purchaseId || null,
          buyer_email: isValidEmail(buyer_email) ? buyer_email : null,
          buyer_name: buyer_name || null,
          numbers,
          status,
          status_detail,
          amount_cents,
          live_mode: isLive,           // guardar live_mode del pago
          via: fetched.via,            // plataforma o seller
        },
        { onConflict: "mp_payment_id" }
      )
      .select()
      .single();

    if (payErr) {
      console.error("[mp webhook] payments upsert error", { eventId, payErr });
      return res.status(200).json({ ok: false, error: "payments_upsert_error" });
    }

    // ==== Transiciones de estado (solo pagos REALES) ====
    if (status === "approved" && isLive) {
      // Tickets → sold
      if (raffleId && numbers.length) {
        await supabase
          .from("tickets")
          .update({ status: "sold", payment_ref: mpIdStr })
          .eq("raffle_id", raffleId)
          .in("number", numbers);
      }

      // Purchase → approved
      if (purchaseId) {
        await supabase
          .from("purchases")
          .update({ status: "approved", paid_at: new Date().toISOString() })
          .eq("id", purchaseId);
      }

      // Datos de rifa (para emails)
      let raffleTitle = "Rifa";
      let creatorEmail = null;
      if (raffleId) {
        const { data: r } = await supabase
          .from("raffles")
          .select("id,title,creator_email")
          .eq("id", raffleId)
          .maybeSingle();
        if (r) {
          raffleTitle = r.title || raffleTitle;
          creatorEmail = r.creator_email || null;
        }
      }
      if (!creatorEmail && process.env.CREATOR_FALLBACK_EMAIL) {
        creatorEmail = process.env.CREATOR_FALLBACK_EMAIL;
      }

      const amountCLP = Math.round((amount_cents || 0) / 100);
      const raffleLink = raffleId ? `${BASE}/rifas/${raffleId}` : BASE || "";

      // Email a comprador (idempotente)
      if (isValidEmail(buyer_email) && !payRow?.emailed_buyer) {
        try {
          await sendBuyerApprovedEmail({
            to: buyer_email,
            buyerName: buyer_name,
            raffleTitle,
            numbers,
            amountCLP,
            paymentId: mpIdStr,
            raffleLink,
          });
          await supabase
            .from("payments")
            .update({ emailed_buyer: true })
            .eq("mp_payment_id", mpIdStr);
        } catch (e) {
          console.error("[mailer] buyer email error:", { eventId, err: e?.message || e });
        }
      }

      // Email a creador (idempotente)
      if (isValidEmail(creatorEmail) && !payRow?.emailed_creator) {
        try {
          await sendCreatorSaleEmail({
            to: creatorEmail,
            raffleTitle,
            numbers,
            amountCLP,
            buyerEmail: isValidEmail(buyer_email) ? buyer_email : "-",
            paymentId: mpIdStr,
            raffleLink,
          });
          await supabase
            .from("payments")
            .update({ emailed_creator: true })
            .eq("mp_payment_id", mpIdStr);
        } catch (e) {
          console.error("[mailer] creator email error:", { eventId, err: e?.message || e });
        }
      }
    }

    return res.status(200).json({ ok: true, eventId });
  } catch (e) {
    console.error("[mp webhook] fatal error", e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}










