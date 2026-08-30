// CUMPLIMIENTO-3 — recuperación del caso de cumplimiento para el
// ganador invitado. Mismo patrón que /api/events/orders/[token]
// (EVENT-2): rate limit, token opaco de alta entropía como único
// credencial, respuesta genérica en cualquier fallo -- nunca revela si
// el token tiene formato plausible, si la rifa existe, ni ninguna otra
// señal útil para enumeración. Sin auth.getUser() -- el ganador no
// necesariamente tiene cuenta Rifex.
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";
import { getCaseByAccessToken } from "@/lib/fulfillmentCommunications.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const { token } = req.query || {};
  if (!token || typeof token !== "string" || token.length < 32) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  const ip = resolveClientIp(req);
  if (await enforceRateLimit(req, res, { key: `cumplimiento-caso-lookup:${ip}`, maxHits: 20, windowSeconds: 60 })) return;

  try {
    const fulfillmentCase = await getCaseByAccessToken(token);
    if (!fulfillmentCase) return res.status(404).json({ ok: false, error: "not_found" });
    return res.status(200).json({ ok: true, case: fulfillmentCase });
  } catch (e) {
    console.error("[api/cumplimiento/caso/[token]] error", e?.message || e);
    return res.status(404).json({ ok: false, error: "not_found" });
  }
}
