// src/pages/api/admin/cumplimiento/[id].js
// CUMPLIMIENTO-5 — GET expediente completo de un caso + POST acciones
// de revisión administrativa (iniciar / nota / resolver). Mismo gate
// exacto que el resto de /api/admin/* (adminAuth.resolveAdmin) --
// server-side, nunca confía en ocultar botones en el cliente. Un
// usuario normal o un creador cambiando el :id de la URL nunca puede
// alcanzar este endpoint sin ser realmente admin.
import { resolveAdmin } from "@/lib/adminAuth";
import { getAdminFulfillmentCaseDetail, startAdminReview, addAdminNote, resolveAdminReview } from "@/lib/adminFulfillmentReview";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const auth = await resolveAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ ok: false, error: "missing_id" });

  try {
    if (req.method === "GET") {
      const detail = await getAdminFulfillmentCaseDetail(id);
      if (!detail) return res.status(404).json({ ok: false, error: "not_found" });
      return res.status(200).json({ ok: true, ...detail });
    }

    // POST -- acciones de revisión administrativa (nunca lee req.body
    // antes de que la línea de arriba ya haya validado adminAuth).
    const { action } = req.body || {};
    const actor = { adminId: auth.admin.id, adminEmail: auth.admin.email };

    if (action === "start_review") {
      const result = await startAdminReview(id, actor);
      if (!result.case) return res.status(result.reason === "case_not_escalated" ? 409 : 404).json({ ok: false, error: result.reason });
      return res.status(200).json({ ok: true, case: result.case, noop: !!result.noop });
    }

    if (action === "add_note") {
      const { note } = req.body || {};
      const result = await addAdminNote(id, { ...actor, note });
      if (!result.case) return res.status(result.reason === "case_not_escalated" ? 409 : 404).json({ ok: false, error: result.reason });
      return res.status(200).json({ ok: true, case: result.case });
    }

    if (action === "resolve") {
      const { resolution, note } = req.body || {};
      const result = await resolveAdminReview(id, { ...actor, resolution, note });
      if (!result.case) return res.status(result.reason === "case_not_escalated" ? 409 : 404).json({ ok: false, error: result.reason });
      return res.status(200).json({ ok: true, case: result.case, noop: !!result.noop });
    }

    return res.status(400).json({ ok: false, error: "invalid_action" });
  } catch (e) {
    if (String(e?.message || "").startsWith("invalid_")) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error("[api/admin/cumplimiento/[id]] error", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
