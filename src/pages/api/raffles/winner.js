// src/pages/api/raffles/winner.js
import * as SB from "../../../lib/supabaseAdmin";
const supabaseAdmin = SB.default || SB.supabaseAdmin;

export default async function handler(req, res) {
  try {
    if (!supabaseAdmin?.from) {
      throw new Error("Supabase admin no inicializado. Revisa SUPABASE_SERVICE_ROLE_KEY y la importación.");
    }

    const { rid, ensure } = req.query || {};
    if (!rid) return res.status(400).json({ ok: false, error: "rid requerido" });

    // 1) ¿ya existe resultado?
    const { data: existing, error: e1 } = await supabaseAdmin
      .from("raffle_results")
      .select("*")
      .eq("raffle_id", rid)
      .maybeSingle();
    if (e1) return res.status(500).json({ ok: false, error: e1.message });

    if (existing) {
      return res.status(200).json({ ok: true, winner: existing, ensured: !!ensure });
    }
    if (!ensure) return res.status(200).json({ ok: true, winner: null });

    // 2) ¿quedan libres o reservados?
    const { count: remaining, error: e2 } = await supabaseAdmin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("raffle_id", rid)
      .in("status", ["available", "free", "pending"]);
    if (e2) return res.status(500).json({ ok: false, error: e2.message });
    if ((remaining ?? 0) > 0) {
      return res.status(200).json({ ok: true, ready: false, winner: null });
    }

    // 3) Elegir al azar entre vendidos
    const { data: soldTickets, error: e3 } = await supabaseAdmin
      .from("tickets")
      .select("number")
      .eq("raffle_id", rid)
      .eq("status", "sold");
    if (e3) return res.status(500).json({ ok: false, error: e3.message });
    if (!soldTickets?.length) {
      return res.status(200).json({ ok: true, ready: false, winner: null });
    }
    const winNum = soldTickets[Math.floor(Math.random() * soldTickets.length)].number;

    // 4) Compra asociada (última approved/paid que contenga ese número)
    const { data: purchase, error: e4 } = await supabaseAdmin
      .from("purchases")
      .select("id,buyer_email,buyer_name,created_at,status,numbers")
      .eq("raffle_id", rid)
      .in("status", ["approved", "paid"])
      .contains("numbers", [winNum])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e4) return res.status(500).json({ ok: false, error: e4.message });

    // 5) Guardar resultado
    const insert = {
      raffle_id: rid,
      number: winNum,
      buyer_email: purchase?.buyer_email ?? null,
      buyer_name: purchase?.buyer_name ?? null,
      purchase_id: purchase?.id ?? null,
    };
    const { data: saved, error: e5 } = await supabaseAdmin
      .from("raffle_results")
      .insert(insert)
      .select("*")
      .maybeSingle();
    if (e5) {
      // colisión de PK → re-lee
      const { data: again } = await supabaseAdmin
        .from("raffle_results")
        .select("*")
        .eq("raffle_id", rid)
        .maybeSingle();
      return res.status(200).json({ ok: true, winner: again || insert, ensured: true });
    }

    return res.status(200).json({ ok: true, winner: saved, ensured: true });
  } catch (err) {
    console.error("winner api error:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}

