// src/pages/api/raffles/winner.js
import * as SB from "../../../lib/supabaseAdmin";
import { drawWinner, notifyWinnerDrawn } from "../../../lib/drawWinner";
const supabaseAdmin = SB.default || SB.supabaseAdmin;

export default async function handler(req, res) {
  try {
    if (!supabaseAdmin?.from) {
      throw new Error("Supabase admin no inicializado. Revisa SUPABASE_SERVICE_ROLE_KEY y la importación.");
    }

    const { rid, ensure } = req.query || {};
    if (!rid) return res.status(400).json({ ok: false, error: "rid requerido" });

    if (!ensure) {
      const { data: existing, error } = await supabaseAdmin
        .from("raffle_results")
        .select("*")
        .eq("raffle_id", rid)
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, winner: existing || null });
    }

    const result = await drawWinner(rid);
    if (result.isNew) {
      notifyWinnerDrawn(rid, result.winner).catch((e) =>
        console.error("[winner api] notify error:", e?.message || e)
      );
    }

    return res.status(200).json({ ok: true, winner: result.winner, ready: result.ready, ensured: true });
  } catch (err) {
    console.error("winner api error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
