// src/pages/api/cron/fulfillment-scheduler.js
// CUMPLIMIENTO-4 — disparo de la línea de tiempo de cumplimiento (Día
// 10/15/20 + escalamiento interno). Server-only, protegido por el
// MISMO CRON_SECRET que draw-scheduler.js (mismo threat model: solo un
// llamador autorizado, nunca el navegador, ningún bypass alternativo).
// No acepta ningún dato del cliente -- processFulfillmentTimeline
// decide todo server-side a partir de la base real. `now` se calcula
// UNA vez acá (el único lugar permitido para leer el reloj del
// sistema) y se pasa explícito, nunca se lee dentro del dominio.
//
// NO activado en Vercel Cron/GitHub Actions PROD todavía por esta
// misión -- ver docs/cumplimiento/CUMPLIMIENTO_4_RESPONSES_AND_TIMELINE.md.
import { processFulfillmentTimeline } from "@/lib/fulfillmentTimeline";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const secret = process.env.CRON_SECRET;
  const authz = req.headers.authorization || "";
  if (!secret || authz !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const now = new Date();
    const { processed, results } = await processFulfillmentTimeline(now);
    return res.status(200).json({ ok: true, processed, results });
  } catch (e) {
    console.error("[cron/fulfillment-scheduler] error", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
