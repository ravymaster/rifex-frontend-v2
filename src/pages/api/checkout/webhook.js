// src/pages/api/checkout/webhook.js
import { createClient } from "@supabase/supabase-js";
import {
  sendBuyerApprovedEmail,
  sendCreatorSaleEmail,
} from "../../../lib/mailer";

// Cliente server (service role) para saltar RLS en backend
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

    // ID del pago según distintos formatos de MP
    const paymentId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.id ||
      (typeof body?.data === "string" ? body.data : null);

    // Pings sin ID: respondemos 200 para no reintentos
    if (!paymentId) return res.status(200).json({ ok: true, msg: "no payment id" });

    // Traer pago real desde MP
    const token = process.env.MP_ACCESS_TOKEN;
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mp = await mpRes.json().catch(() => ({}));

    const status = String(mp?.status || "").toLowerCase();           // approved|pending|rejected...
    const status_detail = mp?.status_detail || null;

    // Metadata enviada al crear la preferencia (mp.js)
    const md = mp?.metadata || {};

    // RaffleId directo desde metadata (ideal)
    let raffleId =
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

    // Emails del comprador (preferimos los del formulario)
    const buyer_email = md.buyer_email || mp?.payer?.email || null;
    const buyer_name = md.buyer_name || mp?.payer?.first_name || null;

    // Monto
    const amount_cents = Math.round(Number(mp?.transaction_amount || 0) * 100);

    // purchaseId desde external_reference (en mp.js lo seteamos a purchase.id)
    let purchaseId = null;
    const extRef = mp?.external_reference || null;
    if (extRef && typeof extRef === "string") {
      purchaseId = extRef;
    }
    if (!purchaseId && md.purchase_id) purchaseId = md.purchase_id;

    // Fallback: si no vino raffleId en metadata, buscamos por purchaseId en purchases
    if (!raffleId && purchaseId) {
      const { data: pr } = await supabase
        .from("purchases")
        .select("raffle_id")
        .eq("id", purchaseId)
        .maybeSingle();
      if (pr?.raffle_id) raffleId = pr.raffle_id;
    }

    // Upsert en payments (idempotente por mp_payment_id) y guardamos también purchase_id
    const { data: payRow } = await supabase
      .from("payments")
      .upsert(
        {
          mp_payment_id: String(mp?.id || paymentId),
          raffle_id: raffleId || null,
          purchase_id: purchaseId || null,
          buyer_email,
          buyer_name,
          numbers,
          status,
          status_detail,
          amount_cents,
        },
        { onConflict: "mp_payment_id" }
      )
      .select()
      .single();

    // Si aprobado → marcar sold, (opcional) cerrar reserva/compra y enviar correos
    if (status === "approved") {
      // Marcar números vendid@s
      if (raffleId && numbers.length) {
        await supabase
          .from("tickets")
          .update({ status: "sold", payment_ref: String(mp?.id || paymentId) })
          .eq("raffle_id", raffleId)
          .in("number", numbers);
      }

      // (Opcional) reflejar aprobado en purchases si tenemos purchaseId
      if (purchaseId) {
        await supabase
          .from("purchases")
          .update({ status: "approved", paid_at: new Date().toISOString() })
          .eq("id", purchaseId);
      }

      // Traer rifa para título y correo del creador
      let raffleTitle = "Rifa";
      let creatorEmail = null;

      if (raffleId) {
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

      // Fallback a .env si no hay creator_email en DB
      if (!creatorEmail && process.env.CREATOR_FALLBACK_EMAIL) {
        creatorEmail = process.env.CREATOR_FALLBACK_EMAIL;
      }

      const amountCLP = Math.round((amount_cents || 0) / 100);
      const mpIdStr = String(mp?.id || paymentId);

      // Email comprador (solo si no se envió antes)
      if (buyer_email && !payRow?.emailed_buyer) {
        try {
          await sendBuyerApprovedEmail({
            to: buyer_email,
            buyerName: buyer_name,
            raffleTitle,
            numbers,
            amountCLP,
            paymentId: mpIdStr,
          });
          await supabase
            .from("payments")
            .update({ emailed_buyer: true })
            .eq("mp_payment_id", mpIdStr);
        } catch (e) {
          console.error("[mailer] buyer email error:", e);
        }
      }

      // Email creador (prioritario para vos)
      if (creatorEmail && !payRow?.emailed_creator) {
        try {
          await sendCreatorSaleEmail({
            to: creatorEmail,
            raffleTitle,
            numbers,
            amountCLP,
            buyerEmail: buyer_email,
            paymentId: mpIdStr,
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
    // devolvemos 200 para evitar reintentos infinitos; para debug duro, cambiar a 500 temporalmente
    return res.status(200).json({ ok: false, error: String(e) });
  }
}


