// src/pages/api/admin/overview.js
// Centro operativo read-only (A2-B): counts, actividad reciente, pagos
// recientes y alertas de salud. Ninguna acción — solo lectura. Mismo gate
// que el resto de /api/admin/*.
//
// Fuentes auditadas por métrica (no se inventa ninguna):
// - usuarios totales: auth.users vía listUsers (una sola página; el
//   volumen real de Rifex hoy es chico, no pagina — anotado como límite).
// - creadores con actividad: creator_id distintos entre raffles + colectas
//   (no es lo mismo que "usuarios totales" — la mayoría de los usuarios
//   registrados nunca crean nada).
// - rifas activas: raffles.status='active' (columna directa, autoritativa).
// - campañas activas: isAcceptingContributions() de colectaStatus.js — NO
//   la columna status cruda (una campaña 'active' con end_at vencido no
//   cuenta como activa, mismo criterio que la página pública/checkout).
// - cuentas MP conectadas/desconectadas: merchant_gateways.status
//   ('connected' | 'not_connected', valores reales escritos por
//   oauth/callback.js y disconnect.js) — nunca select('*'), solo
//   user_id+status.
// - pagos approved/pending/rejected: payments.status (Rifas) +
//   colecta_contributions.status (Campañas), combinados.
// - "pending antiguo": status='pending' Y created_at hace más de
//   PENDING_STALE_HOURS — ambas tablas tienen created_at real, confirmado
//   contra el esquema real antes de escribir esto.
// - alertas de reconciliación: SOLO Campañas tiene traza en webhook_events
//   (event_type='colecta.reconcile'); reconcile-payments.js (Rifas) no
//   escribe ningún trace hoy — asimetría real, reportada, no simulada. De
//   esas trazas, solo se cuentan razones genuinamente anómalas
//   (db_error, search_failed, metadata_mismatch, payment_already_used,
//   colecta_not_found) — no_payment_found/no_seller_token/mp_rejected son
//   resultados normales de una reconciliación, no errores.
import { createClient } from "@supabase/supabase-js";
import { resolveAdmin } from "@/lib/adminAuth";
import { isAcceptingContributions } from "@/lib/colectaStatus";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const PENDING_STALE_HOURS = 1;
const RECENT_LIMIT = 10;
const RECONCILE_ERROR_REASONS = new Set([
  "db_error",
  "search_failed",
  "metadata_mismatch",
  "payment_already_used",
  "colecta_not_found",
]);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const auth = await resolveAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  try {
    const staleCutoff = new Date(Date.now() - PENDING_STALE_HOURS * 3600_000).toISOString();

    const [
      { data: authUsers },
      { data: raffles },
      { data: colectas },
      { data: gateways },
      { data: payments },
      { data: contribs },
      { data: reconcileTraces },
    ] = await Promise.all([
      supabase.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from("raffles").select("id,title,status,creator_id,creator_email,created_at"),
      supabase.from("colectas").select("id,title,status,end_at,creator_id,created_at"),
      supabase.from("merchant_gateways").select("user_id,status").eq("provider", "mp"),
      supabase
        .from("payments")
        .select("mp_payment_id,raffle_id,amount_cents,marketplace_fee_cents,status,created_at"),
      supabase
        .from("colecta_contributions")
        .select("mp_payment_id,colecta_id,amount_cents,marketplace_fee_cents,status,created_at"),
      supabase
        .from("webhook_events")
        .select("event_type,payment_id,payload,received_at")
        .eq("event_type", "colecta.reconcile")
        .order("id", { ascending: false })
        .limit(50),
    ]);

    const emailByUid = Object.fromEntries((authUsers?.users || []).map((u) => [u.id, u.email || null]));
    const usersTotal = authUsers?.users?.length ?? null;

    const raffleById = Object.fromEntries((raffles || []).map((r) => [r.id, r]));
    const colectaById = Object.fromEntries((colectas || []).map((c) => [c.id, c]));

    // ---- counts ----
    const creatorIds = new Set([
      ...(raffles || []).map((r) => r.creator_id).filter(Boolean),
      ...(colectas || []).map((c) => c.creator_id).filter(Boolean),
    ]);
    const rafflesActive = (raffles || []).filter((r) => r.status === "active").length;
    const campaignsActive = (colectas || []).filter((c) => isAcceptingContributions(c)).length;
    const mpConnected = (gateways || []).filter((g) => g.status === "connected").length;
    const mpDisconnected = (gateways || []).filter((g) => g.status !== "connected").length;

    const allOps = [
      ...(payments || []).map((p) => ({ ...p, product: "raffle" })),
      ...(contribs || []).map((c) => ({ ...c, product: "campaign" })),
    ];
    const paymentsApproved = allOps.filter((o) => o.status === "approved").length;
    const paymentsPending = allOps.filter((o) => o.status === "pending").length;
    const paymentsRejected = allOps.filter((o) => o.status === "rejected").length;

    // ---- actividad reciente (rifas + campañas, últimas RECENT_LIMIT) ----
    const activityItems = [
      ...(raffles || []).map((r) => ({
        type: "raffle",
        title: r.title,
        creator_email: r.creator_email || emailByUid[r.creator_id] || null,
        status: r.status,
        created_at: r.created_at,
        public_url: `/rifas/${r.id}`,
      })),
      ...(colectas || []).map((c) => ({
        type: "campaign",
        title: c.title,
        creator_email: emailByUid[c.creator_id] || null,
        status: isAcceptingContributions(c) ? "active" : c.status,
        created_at: c.created_at,
        public_url: `/colectas/${c.id}`,
      })),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, RECENT_LIMIT);

    // ---- pagos recientes (combinados, últimos RECENT_LIMIT) ----
    const recentPayments = allOps
      .map((o) => ({
        product: o.product === "raffle" ? "Rifa" : "Campaña",
        title: o.product === "raffle" ? raffleById[o.raffle_id]?.title || null : colectaById[o.colecta_id]?.title || null,
        amount_cents: o.amount_cents,
        fee_cents: o.marketplace_fee_cents,
        status: o.status,
        mp_payment_id: o.mp_payment_id,
        created_at: o.created_at,
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, RECENT_LIMIT);

    // ---- alertas ----
    const approvedMissingFee = allOps
      .filter((o) => o.status === "approved" && o.marketplace_fee_cents == null)
      .map((o) => ({ product: o.product === "raffle" ? "Rifa" : "Campaña", mp_payment_id: o.mp_payment_id }));

    const pendingStale = allOps
      .filter((o) => o.status === "pending" && o.created_at && o.created_at < staleCutoff)
      .map((o) => ({ product: o.product === "raffle" ? "Rifa" : "Campaña", mp_payment_id: o.mp_payment_id, created_at: o.created_at }));

    const reconcileErrors = (reconcileTraces || [])
      .filter((t) => RECONCILE_ERROR_REASONS.has(t.payload?.reason))
      .map((t) => ({ reason: t.payload.reason, payment_id: t.payment_id, received_at: t.received_at }));

    return res.status(200).json({
      ok: true,
      counts: {
        users_total: usersTotal,
        creators_active: creatorIds.size,
        raffles_active: rafflesActive,
        campaigns_active: campaignsActive,
        mp_connected: mpConnected,
        mp_disconnected: mpDisconnected,
        payments_approved: paymentsApproved,
        payments_pending: paymentsPending,
        payments_rejected: paymentsRejected,
      },
      recent_activity: activityItems,
      recent_payments: recentPayments,
      alerts: {
        approved_missing_fee: approvedMissingFee,
        pending_stale: { threshold_hours: PENDING_STALE_HOURS, items: pendingStale },
        reconcile_errors: {
          items: reconcileErrors,
          note: "Solo Campañas tiene traza de reconciliación en webhook_events; Rifas no tiene un equivalente hoy.",
        },
        mp_disconnected: mpDisconnected,
      },
    });
  } catch (e) {
    console.error("[api/admin/overview] error", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
