// src/pages/api/raffles/winner.js
// Lectura PÚBLICA del ganador de una rifa — solo lectura.
//
// Limitar campos públicos (2026-11-06):
// - Responde solo número, fecha y nombre enmascarado (ver
//   src/lib/publicWinner.js); nunca el correo ni el nombre completo.
// - No sortea. El sorteo queda en las autoridades internas que ya
//   existían: conciliación de pagos al agotarse
//   la rifa (paymentReconcile.js, 'sold_out_auto'), el scheduler
//   (api/cron/draw-scheduler.js, CRON_SECRET) y el sorteo manual del dueño
//   (POST /api/rifas/[id]/draw, autenticado). Cualquier parámetro extra
//   enviado por el navegador se ignora.
import * as SB from "../../../lib/supabaseAdmin";
import { isUuid } from "../../../lib/idOrSlug";
import { PUBLIC_WINNER_SELECT, toPublicWinner } from "../../../lib/publicWinner";
const supabaseAdmin = SB.default || SB.supabaseAdmin;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    if (!supabaseAdmin?.from) {
      throw new Error("Supabase admin no inicializado. Revisa SUPABASE_SERVICE_ROLE_KEY y la importación.");
    }

    const rid = String((req.query || {}).rid || "").trim();
    if (!rid) return res.status(400).json({ ok: false, error: "rid requerido" });
    if (!isUuid(rid)) return res.status(400).json({ ok: false, error: "rid inválido" });

    const { data: existing, error } = await supabaseAdmin
      .from("raffle_results")
      .select(PUBLIC_WINNER_SELECT)
      .eq("raffle_id", rid)
      .maybeSingle();
    if (error) {
      console.error("winner api error:", error);
      return res.status(500).json({ ok: false, error: "read_failed" });
    }
    return res.status(200).json({ ok: true, winner: toPublicWinner(existing) });
  } catch (err) {
    console.error("winner api error:", err);
    return res.status(500).json({ ok: false, error: "read_failed" });
  }
}
