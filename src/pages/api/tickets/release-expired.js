// src/pages/api/tickets/release-expired.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const supabase = createClient(url, service || anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const rid = req.query.rid || req.body?.rid || null;
    const nowIso = new Date().toISOString();

    // 1) compras vencidas (no pagadas) → ids
    const { data: expPurch, error: pErr } = await supabase
      .from("purchases")
      .select("id")
      .in("status", ["initiated", "pending_payment"])
      .lt("holds_until", nowIso);

    if (pErr) throw pErr;

    const expIds = (expPurch || []).map((p) => p.id);
    let released = 0;

    if (expIds.length) {
      // 2) liberar tickets
      const q1 = supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null, hold_until: null })
        .in("purchase_id", expIds)
        .eq("status", "pending");

      const { error: tErr, count } = await q1.select("*", { count: "exact" });
      if (tErr) throw tErr;
      released += count || 0;

      // 3) marcar purchases como expired
      await supabase
        .from("purchases")
        .update({ status: "expired" })
        .in("id", expIds);
    }

    // 4) fallback: tickets con hold_until vencido (por si falta holds_until en purchase)
    const q2 = supabase
      .from("tickets")
      .update({ status: "available", purchase_id: null, hold_until: null })
      .lt("hold_until", nowIso)
      .eq("status", "pending");

    const { error: t2Err, count: count2 } = await q2.select("*", { count: "exact" });
    if (t2Err) throw t2Err;
    released += count2 || 0;

    return res.status(200).json({ ok: true, released, expired_purchases: expIds.length });
  } catch (e) {
    console.error("release-expired error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
