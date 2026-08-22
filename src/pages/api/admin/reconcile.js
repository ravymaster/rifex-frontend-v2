// src/pages/api/admin/reconcile.js
// Proxy server-side (A3): invoca los mecanismos autoritativos YA
// certificados (reconcile-payments.js para Rifas, reconcile-colecta-
// payments.js para Campañas) sin que el navegador toque nunca
// ADMIN_API_TOKEN. Ningún UPDATE nuevo, ninguna lógica financiera nueva
// — este archivo no decide nada, solo reenvía con el header server-side y
// devuelve la misma respuesta que el reconciliador ya certificado.
import { resolveAdmin } from "@/lib/adminAuth";

function resolveBaseUrl(req) {
  const cfg = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (cfg) return cfg;
  const proto = (req.headers["x-forwarded-proto"] || "https") + "://";
  const host = req.headers.host || "localhost:3000";
  return `${proto}${host}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const auth = await resolveAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const { product, id } = req.body || {};
  if (!["raffle", "campaign"].includes(product)) {
    return res.status(400).json({ ok: false, error: "invalid_product" });
  }
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return res.status(400).json({ ok: false, error: "invalid_id" });
  }

  const token = process.env.ADMIN_API_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: "server_misconfigured" });

  const base = resolveBaseUrl(req);
  const target = product === "raffle" ? `${base}/api/admin/reconcile-payments` : `${base}/api/admin/reconcile-colecta-payments`;
  const body = product === "raffle" ? { purchase_id: id } : { contribution_id: id };

  try {
    const r = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "invalid_upstream_response" }));
    return res.status(r.status).json(j);
  } catch (e) {
    console.error("[api/admin/reconcile] proxy error", e);
    return res.status(502).json({ ok: false, error: "reconcile_proxy_failed" });
  }
}
