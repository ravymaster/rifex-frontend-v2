// src/pages/api/checkout/webhook.js
import { supabase } from "../../../lib/supabaseClient";
import { MercadoPagoConfig, Payment } from "mercadopago";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const { data } = req.body || {};
    const paymentId = data?.id || data?.resource?.id || req.query["data.id"];
    if (!paymentId) {
      return res.status(200).json({ ok: true, skipped: "no_payment_id" });
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Missing MP_ACCESS_TOKEN");

    const mpClient = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(mpClient);

    const p = await payment.get({ id: String(paymentId) });
    const status = p.status; // approved | pending | rejected
    const preference_id =
      p.metadata?.preference_id ||
      p.order?.id ||
      p.additional_info?.items?.[0]?.id ||
      null;

    if (!preference_id) {
      return res.status(200).json({ ok: true, skipped: "no_preference" });
    }

    // Buscar la purchase asociada
    const { data: purchase, error: perr } = await supabase
      .from("purchases")
      .select("*")
      .eq("mp_preference_id", preference_id)
      .single();

    if (perr || !purchase) {
      return res.status(200).json({ ok: true, skipped: "no_purchase" });
    }

    // Actualizar estado de la purchase
    await supabase
      .from("purchases")
      .update({ status, mp_payment_id: String(paymentId) })
      .eq("id", purchase.id);

    if (status === "approved") {
      // Marcar tickets como vendidos
      await supabase
        .from("tickets")
        .update({ status: "sold" })
        .eq("raffle_id", purchase.raffle_id)
        .eq("purchase_id", purchase.id);

      // Enviar email de confirmación si está habilitado
      if (process.env.ENABLE_EMAILS === "true") {
        try {
          if (purchase?.buyer_email) {
            await fetch(
              `${process.env.NEXT_PUBLIC_BASE_URL}/api/email/confirm`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: purchase.buyer_email,
                  raffleId: purchase.raffle_id,
                  numbers: purchase.numbers,
                  paymentId: String(paymentId),
                }),
              }
            );
          }
        } catch (err) {
          console.error("email confirm error:", err);
        }
      }
    } else if (status === "rejected" || status === "cancelled") {
      // liberar los números si falla
      await supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null })
        .eq("raffle_id", purchase.raffle_id)
        .eq("purchase_id", purchase.id);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
