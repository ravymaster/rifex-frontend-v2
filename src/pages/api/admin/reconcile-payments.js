// src/pages/api/admin/reconcile-payments.js
import { createClient } from "@supabase/supabase-js";
import { applyMpPayment } from "@/lib/paymentReconcile";

export const config = { runtime: "nodejs" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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

// PRE-LAUNCH-FIX-1 (P0-2): antes, esta función tenía su propia copia de
// "qué hacer con un pago approved" — divergente de webhook.js en un punto
// crítico: filtraba la actualización de tickets por raffle_id+number en
// vez de purchase_id, y además intentaba escribir `tickets.payment_ref`
// (columna que nunca existió en el modelo real, solo en la tabla legacy
// `rifa_tickets`), así que esa UPDATE fallaba en silencio. Ahora
// reconcile-payments.js usa la MISMA applyMpPayment() que webhook.js y
// confirm.js — sin duplicar, sin poder divergir — así que reconciliar dos
// veces el mismo pago, o reconciliar después de que el webhook ya
// convergió, nunca tiene efectos adicionales (idempotente).
async function processApproved(mp, fetchedVia) {
  return applyMpPayment({ supabase, mp, fetchedVia });
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
