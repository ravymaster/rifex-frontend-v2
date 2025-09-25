// src/pages/api/mp/status.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  // Usamos SERVICE_ROLE para leer sin depender de cookies.
  // Este endpoint solo expone si está conectado, el email y el mp_user_id.
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ connected: false, error: "method_not_allowed" });
    }

    // Requerimos uid explícito para evitar ambigüedades de sesión/cookies
    const uid = (req.query.uid || "").toString().trim();
    if (!uid) {
      return res.status(400).json({ connected: false, error: "missing_uid" });
    }

    // Buscamos el vínculo activo en merchant_gateways
    const { data, error } = await supabase
      .from("merchant_gateways")
      .select("provider, revoked_at, mp_user_id, linked_email, live_mode, updated_at")
      .eq("user_id", uid)
      .eq("provider", "mp")
      .maybeSingle();

    if (error) throw error;

    const connected = !!(data && !data.revoked_at);

    return res.status(200).json({
      connected,
      mp_user_id: data?.mp_user_id || null,
      email: data?.linked_email || null,
      live_mode: !!data?.live_mode,
      updated_at: data?.updated_at || null,
    });
  } catch (e) {
    console.error("[api/mp/status] error:", e);
    return res
      .status(200)
      .json({ connected: false, error: e?.message || String(e) });
  }
}

