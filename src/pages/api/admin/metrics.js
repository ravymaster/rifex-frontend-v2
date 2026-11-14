// src/pages/api/admin/metrics.js
// Dos métricas del Dashboard Admin (A2), nunca mezcladas entre sí:
//
// 1) raised_cl_cents — total recaudado en Chile: suma REAL de
//    payments.amount_cents (Rifas) + colecta_contributions.amount_cents
//    (Campañas), solo status='approved'. Nunca estimado desde números
//    vendidos ni desde metas.
// 2) rifex_revenue_cl_cents — ingresos Rifex en Chile: suma de la comisión
//    marketplace REALMENTE asociada a esas mismas operaciones aprobadas.
//    Fuente autoritativa confirmada para ambos productos:
//    payments.marketplace_fee_cents (Rifas) y
//    colecta_contributions.marketplace_fee_cents (Campañas) — en los dos
//    casos es el mismo dato: el application_fee que MP reportó en el pago
//    real (webhook.js / reconcile-payments.js lo escriben idéntico para
//    Rifas; webhook-colecta.js / colectaReconcile.js para Campañas).
//
// "en Chile" = el creador de la rifa/campaña tiene users_profile.country_code
// = 'CL' (nunca se asume — se resuelve siempre contra la DB real).
//
// Si algún pago approved no tiene marketplace_fee_cents registrado (null),
// NO se inventa un valor: se excluye de la suma (igual que haría SQL SUM)
// y se reporta aparte en data_gaps para que el dashboard lo muestre como
// advertencia, no lo esconda.
import { createClient } from "@supabase/supabase-js";
import { resolveAdmin } from "@/lib/adminAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function clCreatorIds(creatorIds) {
  const uniqueIds = [...new Set(creatorIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set();
  const { data } = await supabase
    .from("users_profile")
    .select("user_id,country_code")
    .in("user_id", uniqueIds);
  return new Set((data || []).filter((p) => p.country_code === "CL").map((p) => p.user_id));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const auth = await resolveAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  try {
    // ---- Rifas: payments approved -> raffle.creator_id -> country_code ----
    const { data: payments, error: pErr } = await supabase
      .from("payments")
      .select("raffle_id,amount_cents,marketplace_fee_cents")
      .eq("status", "approved");
    if (pErr) throw pErr;

    const raffleIds = [...new Set((payments || []).map((p) => p.raffle_id).filter(Boolean))];
    const { data: raffleRows } = raffleIds.length
      ? await supabase.from("raffles").select("id,creator_id").in("id", raffleIds)
      : { data: [] };
    const raffleCreatorById = Object.fromEntries((raffleRows || []).map((r) => [r.id, r.creator_id]));

    const raffleCreatorIds = Object.values(raffleCreatorById);
    const clRaffleCreators = await clCreatorIds(raffleCreatorIds);

    let raisedRafflesCents = 0;
    let feeRafflesCents = 0;
    let rafflesMissingFee = 0;
    for (const p of payments || []) {
      const creatorId = raffleCreatorById[p.raffle_id];
      if (!clRaffleCreators.has(creatorId)) continue;
      raisedRafflesCents += Number(p.amount_cents || 0);
      if (p.marketplace_fee_cents == null) {
        rafflesMissingFee += 1;
      } else {
        feeRafflesCents += Number(p.marketplace_fee_cents || 0);
      }
    }

    // ---- Campañas: colecta_contributions approved -> colecta.creator_id -> country_code ----
    const { data: contribs, error: cErr } = await supabase
      .from("colecta_contributions")
      .select("colecta_id,amount_cents,marketplace_fee_cents")
      .eq("status", "approved");
    if (cErr) throw cErr;

    const colectaIds = [...new Set((contribs || []).map((c) => c.colecta_id).filter(Boolean))];
    const { data: colectaRows } = colectaIds.length
      ? await supabase.from("colectas").select("id,creator_id").in("id", colectaIds)
      : { data: [] };
    const colectaCreatorById = Object.fromEntries((colectaRows || []).map((c) => [c.id, c.creator_id]));

    const colectaCreatorIds = Object.values(colectaCreatorById);
    const clColectaCreators = await clCreatorIds(colectaCreatorIds);

    let raisedColectasCents = 0;
    let feeColectasCents = 0;
    let colectasMissingFee = 0;
    for (const c of contribs || []) {
      const creatorId = colectaCreatorById[c.colecta_id];
      if (!clColectaCreators.has(creatorId)) continue;
      raisedColectasCents += Number(c.amount_cents || 0);
      if (c.marketplace_fee_cents == null) {
        colectasMissingFee += 1;
      } else {
        feeColectasCents += Number(c.marketplace_fee_cents || 0);
      }
    }

    return res.status(200).json({
      ok: true,
      raised_cl_cents: raisedRafflesCents + raisedColectasCents,
      rifex_revenue_cl_cents: feeRafflesCents + feeColectasCents,
      breakdown: {
        raffles: { raised_cents: raisedRafflesCents, fee_cents: feeRafflesCents },
        campaigns: { raised_cents: raisedColectasCents, fee_cents: feeColectasCents },
      },
      data_gaps: {
        raffles_approved_without_fee: rafflesMissingFee,
        campaigns_approved_without_fee: colectasMissingFee,
      },
    });
  } catch (e) {
    console.error("[api/admin/metrics] error", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
