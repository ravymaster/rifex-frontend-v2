// src/pages/api/checkout/webhook.js
import { createClient } from "@supabase/supabase-js";
import {
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

// Cliente **server/admin** (service role) para evitar problemas de RLS/privilegios
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const paymentId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.id ||
      (typeof body?.data === "string" ? body.data : null);

    // Pings sin ID: respondemos 200 para que MP no reintente
    if (!paymentId) return res.status(200).json({ ok: true, msg: "no payment id" });

    // Confirmar pago en MP
    const token = process.env.MP_ACCESS_TOKEN;
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mp = await mpRes.json().catch(() => ({}));

    const status = String(mp?.status || "").toLowerCase();
    const status_detail = mp?.status_detail || null;

    // Metadata enviada al crear la preferencia (mp.js)
    const md = mp?.metadata || {};
    const raffleId =
      md.raffle_id || md.raffleId || md.rid || null;

    // Numbers
    let numbers = [];
    if (Array.isArray(md.numbers)) numbers = md.numbers;
    else if (typeof md.numbers === "string") {
      numbers = md.numbers
        .split(",")
        .map((s) => parseInt(String(s).trim(), 10))
        .filter((n) => Number.isFinite(n));
    }

    // Emails
    const buyer_email = md.buyer_email || mp?.payer?.email || null;
    const buyer_name = md.buyer_name || mp?.payer?.first_name || null;

    const amount_cents = Math.round(Number(mp?.transaction_amount || 0) * 100);

    // Upsert en payments (idempotente por mp_payment_id)
    const { data: payRow } = await supabase
      .from("payments")
      .upsert(
        {
          raffle_id: raffleId,
          buyer_email,
          buyer_name,
          numbers,
          mp_payment_id: String(mp?.id || paymentId),
          status,
          status_detail,
          amount_cents,
        },
        { onConflict: "mp_payment_id" }
      )
      .select()
      .single();

    // Si aprobado: marcar sold + enviar correos
    if (status === "approved") {
      if (raffleId && numbers.length) {
        await supabase
          .from("tickets")
          .update({ status: "sold", payment_ref: String(mp?.id || paymentId) })
          .eq("raffle_id", raffleId)
          .in("number", numbers);
      }

      // Traer rifa + email del creador con **service role**
      let raffleTitle = "Rifa";
      let creatorEmail = null;

      {
        const { data: r } = await supabase
          .from("raffles")
          .select("id,title,creator_email,creator_id")
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

      // Email comprador (si no lo enviamos antes)
      if (buyer_email && !payRow?.emailed_buyer) {
        await sendBuyerApprovedEmail({
          to: buyer_email,
          buyerName: buyer_name,
          raffleTitle,
          numbers,
          amountCLP,
          paymentId: mp?.id || paymentId,
        });
        await supabase
          .from("payments")
          .update({ emailed_buyer: true })
          .eq("mp_payment_id", String(mp?.id || paymentId));
      }

      // Email creador (lo prioritario que te falta)
      if (creatorEmail && !payRow?.emailed_creator) {
        await sendCreatorSaleEmail({
          to: creatorEmail,
          raffleTitle,
          numbers,
          amountCLP,
          buyerEmail: buyer_email,
          paymentId: mp?.id || paymentId,
        });
        await supabase
          .from("payments")
          .update({ emailed_creator: true })
          .eq("mp_payment_id", String(mp?.id || paymentId));
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[mp webhook] error", e);
    // Devolvemos 200 para evitar reintentos infinitos; cambia a 500 si querés debug duro
    return res.status(200).json({ ok: false, error: String(e) });
  }
}


