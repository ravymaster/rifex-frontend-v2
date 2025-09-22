// src/pages/api/checkout/webhook.js
import { createClient } from "@supabase/supabase-js";
import {
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

const isValidEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    const body = req.body || {};
    const paymentId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.id ||
      (typeof body?.data === "string" ? body.data : null);

    if (!paymentId) return res.status(200).json({ ok: true, msg: "no payment id" });

    const token = process.env.MP_ACCESS_TOKEN;
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mp = await mpRes.json().catch(() => ({}));

    const status = String(mp?.status || "").toLowerCase();           // approved|pending|rejected...
    const status_detail = mp?.status_detail || null;
    const md = mp?.metadata || {};

    let purchaseId = md.purchase_id || mp?.external_reference || null;
    if (purchaseId && typeof purchaseId !== "string") purchaseId = String(purchaseId);

    let raffleId = md.raffle_id || md.raffleId || md.rid || null;

    // numbers desde metadata
    let numbers = [];
    if (Array.isArray(md.numbers)) numbers = md.numbers;
    else if (typeof md.numbers === "string") {
      numbers = md.numbers
        .split(",")
        .map((s) => parseInt(String(s).trim(), 10))
        .filter((n) => Number.isFinite(n));
    }

    // si faltan raffle/numbers/email → fallback a purchases
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

      // correo comprador (si tenemos email y aún no marcado)
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

      // correo creador (si tenemos email y aún no marcado)
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
    // mantenemos 200 para no generar reintentos infinitos
    return res.status(200).json({ ok: false, error: String(e) });
  }
}






