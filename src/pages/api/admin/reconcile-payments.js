// src/pages/api/admin/reconcile-payments.js
import { createClient } from "@supabase/supabase-js";
import {
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

export const config = { runtime: "nodejs" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const isValidEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

async function fetchPayment(paymentId, hintMpUserId = null) {
  const platformToken = process.env.MP_ACCESS_TOKEN || null;
  if (platformToken) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (r.ok) return { ok: true, json: await r.json(), via: "platform" };
  }
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
    }
  }
  return { ok: false };
}

async function processApproved(mp, fetchedVia) {
  const status = String(mp?.status || "").toLowerCase();
  if (status !== "approved") return { ok: true, skipped: true };

  const md = mp?.metadata || {};
  let purchaseId = md.purchase_id || mp?.external_reference || null;
  if (purchaseId && typeof purchaseId !== "string") purchaseId = String(purchaseId);
  let raffleId = md.raffle_id || md.raffleId || md.rid || null;

  let numbers = [];
  if (Array.isArray(md.numbers)) numbers = md.numbers;
  else if (typeof md.numbers === "string") {
    numbers = md.numbers
      .split(",")
      .map((s) => parseInt(String(s).trim(), 10))
      .filter((n) => Number.isFinite(n));
  }

  // fallback desde purchases
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
  const mpIdStr = String(mp?.id);

  // idempotente
  const { data: payRow } = await supabase
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
        status_detail: mp?.status_detail || null,
        amount_cents,
        via: fetchedVia,
      },
      { onConflict: "mp_payment_id" }
    )
    .select()
    .single();

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

  // Datos de rifa para correo
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

  // Emails idempotentes
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
      await supabase.from("payments").update({ emailed_buyer: true }).eq("mp_payment_id", mpIdStr);
    } catch (e) {
      console.error("[reconcile] buyer email error:", e?.message || e);
    }
  }

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
      await supabase.from("payments").update({ emailed_creator: true }).eq("mp_payment_id", mpIdStr);
    } catch (e) {
      console.error("[reconcile] creator email error:", e?.message || e);
    }
  }

  return { ok: true, updated: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const adminHeader = req.headers["x-admin-token"];
  if (!adminHeader || adminHeader !== process.env.ADMIN_API_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const { purchase_id, since, limit = 20 } = (await req.body) || {};
    let candidates = [];

    if (purchase_id) {
      const { data } = await supabase
        .from("payments")
        .select("mp_payment_id")
        .eq("purchase_id", purchase_id)
        .limit(50);
      candidates = (data || []).map((r) => r.mp_payment_id).filter(Boolean);
    } else {
      // Tomamos pagos pendientes / en proceso, recientes
      const q = supabase.from("payments").select("mp_payment_id").in("status", ["pending", "in_process"]).order("mp_payment_id", { ascending: false }).limit(Math.min(200, Number(limit) || 20));
      if (since) q.gte("updated_at", since);
      const { data } = await q;
      candidates = (data || []).map((r) => r.mp_payment_id).filter(Boolean);
    }

    const results = [];
    for (const pid of candidates) {
      const fetched = await fetchPayment(pid, null);
      if (!fetched.ok) {
        results.push({ pid, ok: false, error: "fetch_failed" });
        continue;
      }
      const r = await processApproved(fetched.json, fetched.via);
      results.push({ pid, ...r });
    }

    return res.status(200).json({ ok: true, count: results.length, results });
  } catch (e) {
    console.error("[reconcile] fatal:", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
