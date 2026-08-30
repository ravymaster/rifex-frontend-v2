// CUMPLIMIENTO-1 — GET creator case detail. El ownership se aplica
// directamente en la query (mismo criterio que getCreatorCaseDetail) —
// un caso ajeno nunca es visible, ni siquiera para confirmar que existe
// (404 en ambos casos: no existe / no es tuyo).
import { createClient } from "@supabase/supabase-js";
import { getCreatorCaseDetail } from "@/lib/fulfillmentCaseService";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ ok: false, error: "missing_id" });
  }

  try {
    const authz = req.headers.authorization || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "missing_auth" });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: "invalid_auth" });

    const fulfillmentCase = await getCreatorCaseDetail(ures.user.id, id);
    if (!fulfillmentCase) return res.status(404).json({ ok: false, error: "not_found" });

    return res.status(200).json({ ok: true, case: fulfillmentCase });
  } catch (e) {
    console.error("[api/panel/cumplimiento/[id]] error:", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
