// src/pages/api/checkout/confirm.js
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoConfig, Payment } from "mercadopago";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const supabase = createClient(url, service || anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Extrae un payment/collection id numérico desde una URL completa si viene mal
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
    // acepta ambos nombres (MP a veces pasa payment_id) y sanitiza si pegaron la URL completa
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

    const flag = (req.query?.status || "").toLowerCase(); // success/failure/pending
    const cstat = (req.query?.collection_status || "").toLowerCase(); // approved/in_process/rejected
    const extRef = req.query?.external_reference || req.body?.external_reference || null;

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(500).json({
        ok: false,
        error: "missing_mp_access_token",
        hint: "Define MP_ACCESS_TOKEN en el entorno del servidor y reinicia.",
      });
    }

    const mp = new MercadoPagoConfig({ accessToken });
    const payments = new Payment(mp);

    let status = null;
    let purchaseId = null;

    try {
      const pay = await payments.get({ id: String(collectionId) });
      const body = pay?.body || pay || {};
      status = (body.status || "unknown").toLowerCase();
      purchaseId =
        body?.metadata?.purchase_id ||
        body?.metadata?.purchaseId ||
        body?.external_reference ||
        null;
    } catch (err) {
      // Si MP rechaza (401/403), puede devolver el mensaje genérico “Si quieres conocer…”
      const msg = String(err?.message || "").toLowerCase();
      const notAuth =
        msg.includes("if you want to know") ||
        msg.includes("si quieres conocer") ||
        msg.includes("unauthorized") ||
        msg.includes("forbidden") ||
        msg.includes("401") ||
        msg.includes("403");

      if (notAuth) {
        if ((flag === "success" || cstat === "approved") && extRef) {
          // Fallback: la URL indica aprobado y tenemos referencia → devolvemos ok sin tocar BD
          return res.status(200).json({
            ok: true,
            status: "approved",
            purchase_id: extRef,
            fallback: true,
            reason: "mp_auth_failed_but_url_approved",
          });
        }
        return res.status(401).json({
          ok: false,
          error: "mp_unauthorized",
          hint:
            "El MP_ACCESS_TOKEN no pertenece al vendedor del pago o no coincide sandbox/prod. " +
            "Usa el mismo token con el que creaste la preferencia.",
        });
      }

      return res.status(500).json({
        ok: false,
        error: "mp_get_payment_failed",
        detail: err?.message || String(err),
      });
    }

    if (!purchaseId && extRef) purchaseId = extRef;

    // Actualiza purchase/tickets según estado
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

    // rejected / cancelado / otros → liberar
    if (purchaseId) {
      await supabase.from("purchases").update({ status: "failed" }).eq("id", purchaseId);
      await supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null })
        .eq("purchase_id", purchaseId)
        .eq("status", "pending");
    }

    return res.status(200).json({ ok: true, status: "rejected", purchase_id: purchaseId });
  } catch (e) {
    console.error("checkout/confirm error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
