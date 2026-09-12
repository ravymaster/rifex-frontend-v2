// src/pages/api/analytics/track.js
// Único punto de escritura de la analítica propia de visitas/interacción.
// Nunca acepta payment_approved/qr_scan/qr_response (ni siquiera existen
// en el allowlist de src/lib/analyticsEvents.js) -- esos se calculan en
// el dashboard admin leyendo las tablas ya autoritativas de cada módulo,
// nunca desde algo que el navegador declare acá.
//
// Superficie deliberadamente mínima: solo module/entity_id/event_type/
// visitor_id/utm_*/referrer -- nunca nombre/email/teléfono/contenido de
// formularios/tokens. device_category y traffic_type SIEMPRE se
// recalculan server-side desde el User-Agent real de la request, jamás
// se confía en lo que el cliente reporte.
import { enforceRateLimit, resolveClientIp } from "@/lib/rateLimit";
import { validateTrackPayload, insertAnalyticsEvent } from "@/lib/analyticsEvents";

const MAX_BODY_BYTES = 4096;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "payload_too_large" });
  }

  const ip = resolveClientIp(req);
  // Doble llave de límite: por IP (contiene ráfagas de un mismo origen de
  // red) y, cuando el payload trae un visitor_id con forma válida, también
  // por visitante (contiene un solo visitante insistiendo desde IPs
  // distintas). Cualquiera de los dos que se exceda corta la request.
  if (await enforceRateLimit(req, res, { key: `analytics-track-ip:${ip}`, maxHits: 120, windowSeconds: 60 })) return;
  const rawVisitorId = typeof req.body?.visitor_id === "string" ? req.body.visitor_id : null;
  if (rawVisitorId) {
    if (await enforceRateLimit(req, res, { key: `analytics-track-visitor:${rawVisitorId}`, maxHits: 60, windowSeconds: 60 })) return;
  }

  const bodyBytes = Buffer.byteLength(JSON.stringify(req.body || {}), "utf8");
  if (bodyBytes > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "payload_too_large" });
  }

  const validated = validateTrackPayload(req.body);
  if (!validated.ok) {
    return res.status(400).json({ ok: false, error: validated.error });
  }

  try {
    await insertAnalyticsEvent(validated.value, { userAgent: req.headers["user-agent"] });
  } catch (e) {
    console.error("[analytics/track] insert failed:", e.message);
    return res.status(500).json({ ok: false, error: "insert_failed" });
  }

  return res.status(204).end();
}
