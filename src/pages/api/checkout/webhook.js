// src/pages/api/checkout/webhook.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

// Necesitamos raw body para validar la firma
export const config = { api: { bodyParser: false } };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

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

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  let raw = null;
  try {
    raw = await readRawBody(req);
  } catch (e) {
    console.error("[mp webhook] raw body error", e);
    // 200 para que MP no reintente infinito
    return res.status(200).json({ ok: false, error: "raw_body_error" });
  }

  // ----- Validación opcional de firma (recomendada) -----
  try {
    const secret = process.env.MP_WEBHOOK_SECRET;
    const signature = req.headers["x-signature"];
    const reqId = req.headers["x-request-id"];

    if (secret && signature && reqId) {
      // signature viene como "ts=...,v1=..."
      const parts = Object.fromEntries(
        String(signature)
          .split(",")
          .map((kv) => kv.trim().split("="))
      );
      const signed = `id:${reqId};ts:${parts.ts};`;
      const digest = crypto.createHmac("sha256", secret).update(signed).digest("hex");

      if (digest !== parts.v1) {
        console.warn("[mp webhook] firma inválida", { digest, v1: parts.v1, ts: parts.ts });
        return res.status(400).json({ ok: false, error: "invalid_signature" });
      }
    }
  } catch (e) {
    console.warn("[mp webhook] no se pudo validar firma:", e?.message || e);
    // no abortamos; continuamos para no perder eventos
  }

  // ----- Parse del JSON del webhook -----
  let body = {};
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    // MP a veces envía application/x-www-form-urlencoded
    try {
      const txt = raw.toString("utf8");
      const kv = Object.fromEntries(
        txt.split("&").map((p) => {
          const [k, v] = p.split("=");
          return [decodeURIComponent(k), decodeURIComponent(v || "")];
        })
      );
      body = kv;
    } catch (e) {
      console.error("[mp webhook] body parse error", e);
      return res.status(200).json({ ok: false, error: "invalid_body" });
    }
  }

  try {
    const paymentId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.id ||
      (typeof body?.data === "string" ? body.data : null);

    if (!paymentId) {
      // MP puede enviar merchant_orders u otros eventos
      return res.status(200).json({ ok: true, msg: "no payment id" });
    }

    const token = process.env.MP_ACCESS_TOKEN;
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mp = await mpRes.json().catch(() => ({}));

    const status = String(mp?.status || "").toLowerCase(); // approved|pending|rejected...
    const status_detail = mp?.status_detail || null;
    const md = mp?.metadata || {};

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

    // fallback: si faltan datos, traemos desde purchases
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

    // Upsert en payments
    const { data: payRow } = await supabase
      .from("payments")
      .upsert(
        {
          mp_payment_id: String(mp?.id || paymentId),
          raffle_id: raffleId || null,
          purchase_id: purchaseId || null,
          buyer_email: isValidEmail(buyer_email) ? buyer_email : null,
          buyer_name: buyer_name || null,
          numbers,
          status,
          status_detail,
          amount_cents,
        },
        { onConflict: "mp_payment_id" }
      )
      .select()
      .single();

    if (status === "approved") {
      // marcar vendidos
      if (raffleId && numbers.length) {
        await supabase
          .from("tickets")
          .update({ status: "sold", payment_ref: String(mp?.id || paymentId) })
          .eq("raffle_id", raffleId)
          .in("number", numbers);
      }

      // purchase aprobada
      if (purchaseId) {
        await supabase
          .from("purchases")
          .update({ status: "approved", paid_at: new Date().toISOString() })
          .eq("id", purchaseId);
      }

      // datos rifa
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
      const mpIdStr = String(mp?.id || paymentId);
      const raffleLink = raffleId ? `${BASE}/rifas/${raffleId}` : BASE || "";

      // correo comprador
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
          console.error("[mailer] buyer email error:", e);
        }
      }

      // correo creador
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
          console.error("[mailer] creator email error:", e);
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[mp webhook] error", e);
    // 200 para no gatillar reintentos eternos
    return res.status(200).json({ ok: false, error: String(e) });
  }
}







