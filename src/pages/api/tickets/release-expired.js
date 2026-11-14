// src/pages/api/tickets/release-expired.js
import { createClient } from "@supabase/supabase-js";
import { convergePurchaseAndResolve } from "@/lib/paymentReconcile";

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
    const nowIso = new Date().toISOString();

    // 1) compras vencidas (no pagadas) → ids. El propio filtro de status
    // ya excluye 'approved' por construcción — este camino siempre fue
    // seguro, sin cambios.
    const { data: expPurch, error: pErr } = await supabase
      .from("purchases")
      .select("id")
      .in("status", ["initiated", "pending_payment"])
      .lt("holds_until", nowIso);

    if (pErr) throw pErr;

    const expIds = (expPurch || []).map((p) => p.id);
    let released = 0;

    if (expIds.length) {
      const q1 = supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null, hold_until: null })
        .in("purchase_id", expIds)
        .eq("status", "pending");

      const { error: tErr, count } = await q1.select("*", { count: "exact" });
      if (tErr) throw tErr;
      released += count || 0;

      await supabase
        .from("purchases")
        .update({ status: "expired" })
        .in("id", expIds);
    }

    // 2) PRE-LAUNCH-FIX-1 (P0-2): fallback por hold_until vencido (por si
    // falta holds_until en la purchase). Antes esto liberaba CUALQUIER
    // ticket pending con hold vencido, sin mirar el status real de la
    // purchase asociada — si el pago ya estaba approved pero el ticket
    // seguía 'pending' (el bug original de payment_ref hacía que esto
    // pasara en cada pago real), este job lo liberaba y lo dejaba
    // disponible para vendérselo a otro comprador, mientras el primero ya
    // había pagado. Ahora: para cada purchase distinta entre los
    // candidatos, se verifica su status real antes de decidir.
    //   - approved  -> NUNCA liberar; en vez de eso converge a sold
    //     (autorecuperación, sin necesitar el navegador del comprador).
    //   - cualquier otro -> se libera como antes.
    const { data: pendingExpired, error: peErr } = await supabase
      .from("tickets")
      .select("id, purchase_id")
      .eq("status", "pending")
      .lt("hold_until", nowIso);
    if (peErr) throw peErr;

    const candidateIds = (pendingExpired || []).map((t) => t.id);
    const purchaseIds = [...new Set((pendingExpired || []).map((t) => t.purchase_id).filter(Boolean))];

    let convergedPurchases = 0;
    let approvedPurchaseIds = new Set();
    if (purchaseIds.length) {
      const { data: purchaseRows, error: prErr } = await supabase
        .from("purchases")
        .select("id, status")
        .in("id", purchaseIds);
      if (prErr) throw prErr;
      approvedPurchaseIds = new Set((purchaseRows || []).filter((p) => p.status === "approved").map((p) => p.id));

      // PRE-LAUNCH-FIX-2 (P1-NEW-1): usa la MISMA resolución que
      // paymentReconcile.js — nunca confía en "no tiró error" como prueba
      // de éxito. Si por alguna razón esto no logra converger completo
      // (estructuralmente ya no debería pasar bajo el nuevo diseño: una
      // purchase solo llega a 'approved' si ya convergió entero, así que un
      // ticket todavía 'pending' con purchase 'approved' es una ventana de
      // carrera de milisegundos, no un estado estable), queda marcada
      // 'approved_unfulfilled' — nunca se libera un ticket cuyo pago es
      // real solo porque la reparación automática no alcanzó a completarse.
      for (const pid of approvedPurchaseIds) {
        try {
          const resolution = await convergePurchaseAndResolve(supabase, pid);
          if (resolution.fullyConverged) convergedPurchases += 1;
        } catch (e) {
          console.error("[release-expired] converge error", { purchaseId: pid, err: e?.message || e });
        }
      }
    }

    // Ids sin purchase_id, o con purchase_id no-approved -> liberables.
    const releasableIds = (pendingExpired || [])
      .filter((t) => !t.purchase_id || !approvedPurchaseIds.has(t.purchase_id))
      .map((t) => t.id);

    if (releasableIds.length) {
      const { error: t2Err, count: count2 } = await supabase
        .from("tickets")
        .update({ status: "available", purchase_id: null, hold_until: null })
        .in("id", releasableIds)
        .eq("status", "pending") // re-chequeo defensivo por si algo cambió entre el SELECT y aquí
        .select("*", { count: "exact" });
      if (t2Err) throw t2Err;
      released += count2 || 0;
    }

    return res.status(200).json({
      ok: true,
      released,
      expired_purchases: expIds.length,
      converged_to_sold: convergedPurchases,
      candidates_seen: candidateIds.length,
    });
  } catch (e) {
    console.error("release-expired error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
