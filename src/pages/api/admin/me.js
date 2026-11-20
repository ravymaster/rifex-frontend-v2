// src/pages/api/admin/me.js
// Endpoint mínimo para validar autoridad admin real (A1). No expone
// métricas ni datos de negocio — solo confirma si el Bearer token que
// manda el caller pertenece a un admin real.
import { resolveAdmin } from "@/lib/adminAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const result = await resolveAdmin(req);
  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

  return res.status(200).json({ ok: true, admin: true, email: result.admin.email });
}
