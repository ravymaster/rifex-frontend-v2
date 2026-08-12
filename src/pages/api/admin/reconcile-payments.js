// src/pages/api/admin/reconcile-payments.js
import { createClient } from "@supabase/supabase-js";
import {
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

// === Runtime ===
export const config = { runtime: "nodejs" };

// === Supabase (service role preferido) ===
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

// === ENV fees / plan ===
const RIFEX_FEE_PCT = Number(process.env.RIFEX_FEE_PCT || 0.07);        // 7% default
const MP_FEE_FALLBACK_PCT = Number(process.env.MP_FEE_FALLBACK_PCT || 0.04); // 4% default si MP no entrega net_received
const MP_FEE_MIN_CENTS = Number(process.env.MP_FEE_MIN_CENTS || 0);     // mínimo opcional
const DEFAULT_PLAN = String(process.env.RIFEX_PLAN_DEFAULT || "free");  // para mostrar en email

// === Helpers ===
const isValidEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function roundCL(cents) {
  return Math.max(0, Math.round(cents)); // clamp & round
}

// Extrae comisiones MP si es posible (a centavos)
function computeMpFeesCents(mp, amount_cents) {
  try {
    // Preferimos net_received_amount si viene en la respuesta
    const netReceived = Number(mp?.transaction_details?.net_received_amount || 0);
    if (Number.isFinite(netReceived) && netReceived > 0) {
      const net_received_cents = roundCL(netReceived * 100);
      const mp_fee_cents = Math.max(0, amount_cents - net_received_cents);
      return { ok: true, mp_fee_cents, net_received_cents };
    }

    // Fallback: porcentaje estimado + mínimo opcional
    const mp_fee_estim = roundCL(amount_cents * MP_FEE_FALLBACK_PCT);
    const mp_fee_cents = Math.max(mp_fee_estim, MP_FEE_MIN_CENTS);
    const net_received_cents = Math.max(0, amount_cents - mp_fee_cents);
    return { ok: true, mp_fee_cents, net_received_cents, estimated: true };
  } catch {
    // Último recurso: 0
    return {
      ok: false,
      mp_fee_cents: 0,
      net_received_cents: amount_cents,
      estimated: true,
    };
  }
}

// === Registrar evento de reconciliación ===
async function logReconcileEvent({
  payment_id,
  live_mode,
  status,
  payload,
  note = null,
}) {
  try {
    await supabase.from("webhook_events").insert({
      provider: "reconcile",
      event_type: status,
      payment_id,
      live_mode,
      payload,
      headers: {
        source: "reconcile-payments.js",
        timestamp: new Date().toISOString(),
        note,
      },
    });
  } catch (e) {
    console.warn("[reconcile] log insert failed:", e.message || e);
  }
}

// === Consulta pago en MP (token plataforma o seller) ===
async function fetchPayment(paymentId, hintMpUserId = null) {
  const platformToken = process.env.MP_ACCESS_TOKEN || null;

  if (platformToken) {
    const r = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${platformToken}` } }
    );
    if (r.ok) return { ok: true, json: await r.json(), via: "platform" };
  }

  // fallback: token del vendedor
  if (hintMpUserId) {
    const { data: gw } = await supabase
      .from("merchant_gateways")
      .select("access_token, mp_user_id")
      .eq("mp_user_id", String(hintMpUserId))
      .eq("provider", "mp")
      .maybeSingle();
    const sellerToken = gw?.access_token || null;
    if (sellerToken) {
      const r2 = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        { headers: { Authorization: `Bearer ${sellerToken}` } }
      );
      if (r2.ok) return { ok: true, json: await r2.json(), via: "seller" };
    }
  }

  return { ok: false };
}

// === Procesar pago aprobado ===
async function processApproved(mp, fetchedVia) {
  const status = String(mp?.status || "").toLowerCase();
  if (status !== "approved") return { ok: true, skipped: true, reason: "not_approved" };

  const md = mp?.metadata || {};
  let purchaseId = md.purchase_id || mp?.external_reference || null;
  if (purchaseId && typeof purchaseId !== "string")
    purchaseId = String(purchaseId);
  let raffleId = md.raffle_id || md.raffleId || md.rid || null;

  let numbers = [];
  if (Array.isArray(md.numbers)) numbers = md.numbers;
  else if (typeof md.numbers === "string") {
    numbers = md.numbers
      .split(",")
      .map((s) => parseInt(String(s).trim(), 10))
      .filter((n) => Number.isFinite(n));
  }

  // fallback: datos desde purchases
  let buyer_email = (md.buyer_email || mp?.payer?.email || "")
    .trim()
    .toLowerCase();
  let buyer_name = (md.buyer_name || mp?.payer?.first_name || "")
    .toString()
    .trim();

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
        if (!buyer_name && pRow.buyer_name)
          buyer_name = String(pRow.buyer_name).trim();
      }
    }
  }

  const amount_cents = Math.round(Number(mp?.transaction_amount || 0) * 100);
  const mpIdStr = String(mp?.id);
  const isLive = !!(mp.live_mode === true);

  // Antifraude: ignorar pagos sandbox
  if (!isLive) {
    await logReconcileEvent({
      payment_id: mpIdStr,
      live_mode: false,
      status: "ignored_sandbox",
      payload: { id: mpIdStr, status },
    });
    return { ok: true, skipped: true, reason: "sandbox_payment" };
  }

  // === Upsert idempotente base ===
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
        live_mode: true,
      },
      { onConflict: "mp_payment_id" }
    )
    .select()
    .single();

  // === FEES ===
  // Bruto CLP
  const amountCLP = Math.round((amount_cents || 0) / 100);

  // MP fees (reales si hay net_received, si no fallback %)
  const mpFees = computeMpFeesCents(mp, amount_cents);
  const mp_fee_cents = mpFees.mp_fee_cents || 0;
  const net_after_mp_cents = mpFees.net_received_cents || Math.max(0, amount_cents - mp_fee_cents);

  // Rifex fee (7% por defecto o RIFEX_FEE_PCT)
  const rifex_fee_cents = roundCL(amount_cents * RIFEX_FEE_PCT);
  const net_to_creator_cents = Math.max(0, net_after_mp_cents - rifex_fee_cents);

  const mpFeeCLP = Math.round(mp_fee_cents / 100);
  const rifexFeeCLP = Math.round(rifex_fee_cents / 100);
  const netCLP = Math.round(net_to_creator_cents / 100);

  // Log de auditoría con fees
  await logReconcileEvent({
    payment_id: mpIdStr,
    live_mode: true,
    status: "approved",
    payload: {
      via: fetchedVia,
      amount_cents,
      fees: {
        rifex_fee_cents,
        mp_fee_cents,
        net_after_mp_cents,
        net_to_creator_cents,
        rifex_pct: RIFEX_FEE_PCT,
        mp_pct_fallback: MP_FEE_FALLBACK_PCT,
        mp_fee_estimated: !!mpFees.estimated,
      },
    },
  });

  // === Tickets → sold ===
  if (raffleId && numbers.length) {
    await supabase
      .from("tickets")
      .update({ status: "sold", payment_ref: mpIdStr })
      .eq("raffle_id", raffleId)
      .in("number", numbers);
  }

  // === Purchase → approved ===
  if (purchaseId) {
    await supabase
      .from("purchases")
      .update({ status: "approved", paid_at: new Date().toISOString() })
      .eq("id", purchaseId);
  }

  // === Datos de rifa para correos ===
  let raffleTitle = "Rifa";
  let creatorEmail = null;
  if (raffleId) {
    const { data: r } = await supabase
      .from("raffles")
      .select("id,title,creator_email,plan")
      .eq("id", raffleId)
      .maybeSingle();
    if (r) {
      raffleTitle = r.title || raffleTitle;
      creatorEmail = r.creator_email || null;
      // si tu tabla tiene "plan", úsalo para el label del email
      if (r.plan) {
        // opcionalmente podrías ajustar RIFEX_FEE_PCT por plan aquí
      }
    }
  }
  if (!creatorEmail && process.env.CREATOR_FALLBACK_EMAIL) {
    creatorEmail = process.env.CREATOR_FALLBACK_EMAIL;
  }

  const raffleLink = raffleId ? `${BASE}/rifas/${raffleId}` : BASE || "";

  // === Correos idempotentes ===
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
      console.error("[reconcile] buyer email error:", e?.message || e);
    }
  }

  if (isValidEmail(creatorEmail) && !payRow?.emailed_creator) {
    try {
      await sendCreatorSaleEmail({
        to: creatorEmail,
        raffleTitle,
        numbers,
        amountCLP,                              // bruto
        buyerEmail: isValidEmail(buyer_email) ? buyer_email : "-",
        paymentId: mpIdStr,
        raffleLink,
        // === Desglose de fees para el creador ===
        rifexFeeCLP,
        mpFeeCLP,
        netCLP,
        plan: DEFAULT_PLAN, // o r.plan si lo usas en tu tabla
      });
      await supabase
        .from("payments")
        .update({ emailed_creator: true })
        .eq("mp_payment_id", mpIdStr);
    } catch (e) {
      console.error("[reconcile] creator email error:", e?.message || e);
    }
  }

  return { ok: true, updated: true };
}

// === Handler principal ===
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const adminHeader = req.headers["x-admin-token"];
  if (!adminHeader || adminHeader !== process.env.ADMIN_API_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const { purchase_id, since, limit = 20 } = req.body || {};
    let candidates = [];

    if (purchase_id) {
      const { data } = await supabase
        .from("payments")
        .select("mp_payment_id")
        .eq("purchase_id", purchase_id)
        .limit(50);
      candidates = (data || []).map((r) => r.mp_payment_id).filter(Boolean);
    } else {
      const q = supabase
        .from("payments")
        .select("mp_payment_id")
        .in("status", ["pending", "in_process"])
        .order("mp_payment_id", { ascending: false })
        .limit(Math.min(200, Number(limit) || 20));
      if (since) q.gte("updated_at", since);
      const { data } = await q;
      candidates = (data || []).map((r) => r.mp_payment_id).filter(Boolean);
    }

    const results = [];
    for (const pid of candidates) {
      const fetched = await fetchPayment(pid, null);
      if (!fetched.ok) {
        results.push({ pid, ok: false, error: "fetch_failed" });
        await logReconcileEvent({
          payment_id: pid,
          live_mode: null,
          status: "fetch_failed",
          payload: {},
        });
        continue;
      }
      const r = await processApproved(fetched.json, fetched.via);
      results.push({ pid, ...r });
    }

    return res
      .status(200)
      .json({ ok: true, count: results.length, results, checked_at: new Date().toISOString() });
  } catch (e) {
    console.error("[reconcile] fatal:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || String(e), checked_at: new Date().toISOString() });
  }
}

