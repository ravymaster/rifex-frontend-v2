// /src/pages/api/mp/disconnect.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // ⚠️ Usa tu auth real en server (JWT/cookie). Temporalmente aceptamos x-user-id.
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ ok: false, error: "unauthorized: missing x-user-id" });
  }

  try {
    // Limpia filas con provider 'mp' o 'mercadopago'
    const { error, count } = await supabase
      .from("merchant_gateways")
      .update({
        access_token: null,
        mp_access_token: null,
        public_key: null,
        webhook_secret: null,
        mp_user_id: null,
        linked_email: null,
        live_mode: null,
        expires_at: null,
        revoked_at: new Date().toISOString(),
        status: "not_connected",
        updated_at: new Date().toISOString(),
      }, { count: "exact" })
      .eq("user_id", userId)
      .in("provider", ["mp", "mercadopago"]);

    if (error) throw error;

    return res.status(200).json({ ok: true, updated: count || 0 });
  } catch (e) {
    console.error("[api/mp/disconnect] error:", e?.message || e);
    return res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
}


