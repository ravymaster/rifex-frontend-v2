// src/pages/api/admin/cumplimiento.js
// CUMPLIMIENTO-5 — GET resumen + listado de casos de cumplimiento para
// el /admin existente. Mismo gate exacto que el resto de /api/admin/*
// (adminAuth.resolveAdmin) -- ningún mecanismo de autorización nuevo.
// Solo lectura -- ninguna acción destructiva ni de escritura acá.
import { resolveAdmin } from "@/lib/adminAuth";
import { listAdminFulfillmentCases, summarizeAdminFulfillmentCases } from "@/lib/adminFulfillmentReview";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const auth = await resolveAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  try {
    const cases = await listAdminFulfillmentCases();
    const summary = summarizeAdminFulfillmentCases(cases);
    return res.status(200).json({ ok: true, summary, cases });
  } catch (e) {
    console.error("[api/admin/cumplimiento] error", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
