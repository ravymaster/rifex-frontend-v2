// CUMPLIMIENTO-1 — GET creator cases. Único endpoint de lectura de lista
// autorizado por el mandato de esta fase. Nunca acepta escritura (405 en
// cualquier otro método) — registrar respuestas es CUMPLIMIENTO-2+.
import { createClient } from "@supabase/supabase-js";
import { getCreatorCases } from "@/lib/fulfillmentCaseService";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const authz = req.headers.authorization || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "missing_auth" });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: "invalid_auth" });

    const cases = await getCreatorCases(ures.user.id);
    return res.status(200).json({ ok: true, cases });
  } catch (e) {
    console.error("[api/panel/cumplimiento] error:", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
