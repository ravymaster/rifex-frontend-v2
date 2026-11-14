// src/pages/api/panel/earnings.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "missing_auth" });

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: "invalid_auth" });
  const uid = ures.user.id;

  try {
    const { data: raffles, error: rErr } = await supabase
      .from("raffles")
      .select("id, title")
      .eq("creator_id", uid);
    if (rErr) throw rErr;

    const raffleIds = (raffles || []).map((r) => r.id);
    const titleById = Object.fromEntries((raffles || []).map((r) => [r.id, r.title]));

    if (!raffleIds.length) {
      return res.status(200).json({
        ok: true,
        totals: { gross_cents: 0, fee_cents: 0, net_cents: 0, sales_count: 0 },
        by_raffle: [],
        recent: [],
      });
    }

    const { data: payments, error: pErr } = await supabase
      .from("payments")
      .select("raffle_id, amount_cents, marketplace_fee_cents, buyer_email, numbers, created_at")
      .in("raffle_id", raffleIds)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (pErr) throw pErr;

    const rows = payments || [];
    const totals = rows.reduce(
      (acc, p) => {
        const gross = Number(p.amount_cents || 0);
        const fee = Number(p.marketplace_fee_cents || 0);
        acc.gross_cents += gross;
        acc.fee_cents += fee;
        acc.net_cents += gross - fee;
        acc.sales_count += 1;
        return acc;
      },
      { gross_cents: 0, fee_cents: 0, net_cents: 0, sales_count: 0 }
    );

    const perRaffle = {};
    for (const p of rows) {
      const key = p.raffle_id;
      if (!perRaffle[key]) {
        perRaffle[key] = { raffle_id: key, title: titleById[key] || "Rifa", gross_cents: 0, fee_cents: 0, net_cents: 0, sales_count: 0 };
      }
      const gross = Number(p.amount_cents || 0);
      const fee = Number(p.marketplace_fee_cents || 0);
      perRaffle[key].gross_cents += gross;
      perRaffle[key].fee_cents += fee;
      perRaffle[key].net_cents += gross - fee;
      perRaffle[key].sales_count += 1;
    }

    const recent = rows.slice(0, 10).map((p) => ({
      raffle_title: titleById[p.raffle_id] || "Rifa",
      amount_cents: Number(p.amount_cents || 0),
      fee_cents: Number(p.marketplace_fee_cents || 0),
      net_cents: Number(p.amount_cents || 0) - Number(p.marketplace_fee_cents || 0),
      numbers: p.numbers || [],
      created_at: p.created_at,
    }));

    return res.status(200).json({
      ok: true,
      totals,
      by_raffle: Object.values(perRaffle).sort((a, b) => b.net_cents - a.net_cents),
      recent,
    });
  } catch (e) {
    console.error("[api/panel/earnings] error:", e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}
