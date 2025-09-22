// src/pages/api/checkout/confirm.js
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "mercadopago";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const supabase = createClient(url, service || anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// limpia y extrae un payment_id numérico (por si viene una URL)
function extractPaymentId(maybeUrl) {
  if (!maybeUrl) return null;
  const s = String(maybeUrl);
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/(?:[?&](?:collection_id|payment_id)=)(\d+)/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const rawId =
      req.query.collection_id ||
      req.query.payment_id ||
      req.body?.collection_id ||
      req.body?.payment_id ||
      req.query?.id ||
      req.body?.id;

    const collectionId = extractPaymentId(rawId);
    if (!collectionId) {
      return res.status(400).json({ ok: false, error: "missing_or_invalid_collection_id" });
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: "missing_mp_access_token" });
    }

    const mp = new MercadoPagoConfig({ accessToken });
    const payments = new Payment(mp);

    let status = "unknown";
    let purchaseId = null;

    try {
      const pay = await payments.get({ id: String(collectionId) });
      const body = pay?.body || pay || {};
      status = (body.status || "unknown").toLowerCase();
      purchaseId =
        body?.metadata?.purchase_id ||
        body?.external_reference ||
        body?.metadata?.purchaseId ||
        null;

      console.log("[confirm] MP payment", {
        payment_id: collectionId,
        status,
        purchaseId,
      });
    } catch (err) {
      console.error("[confirm] payments.get error", err?.message || err);
      return res.status(502).json({ ok: false, error: "mp_get_payment_failed" });
    }

    if (status === "approved") {
      if (purchaseId) {
        await supabase
          .from("purchases")
          .update({
            status: "approved",
            mp_payment_id: String(collectionId),
            paid_at: new Date().toISOString(),
          })
          .eq("id", purchaseId);

        await supabase
          .from("tickets")
          .update({ status: "sold" })
          .eq("purchase_id", purchaseId)
          .eq("status", "pending");
      }
      return res.status(200).json({ ok: true, status: "approved", purchase_id: purchaseId });
    }

    if (status === "in_process" || status === "pending") {
      if (purchaseId) {
        await supabase
          .from("purchases")
          .update({ status: "pending_payment", mp_payment_id: String(collectionId) })
          .eq("id", purchaseId);
      }
      return res.status(200).json({ ok: true, status: "pending", purchase_id: purchaseId });
    }

    // rechazado/cancelado → liberar
    if (purchaseId) {
      await supabase.from("purchases").update({ status: "failed" }).eq("id", purchaseId);
      await supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null, hold_until: null })
        .eq("purchase_id", purchaseId)
        .eq("status", "pending");
    }

    return res.status(200).json({ ok: true, status: "rejected", purchase_id: purchaseId });
  } catch (e) {
    console.error("checkout/confirm error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}


