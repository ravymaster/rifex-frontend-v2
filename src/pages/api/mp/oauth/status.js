// src/pages/api/mp/status.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  // Preferimos SERVICE_ROLE; si no está, degradamos a ANON para no romper en dev/preview
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ connected: false, error: "method_not_allowed" });
    }

    // Requerimos uid explícito (no dependemos de cookies/sesión aquí)
    const uid = String(req.query.uid || "").trim();
    if (!uid) {
      return res.status(400).json({ connected: false, error: "missing_uid" });
    }

    // Leemos el vínculo a MP
    const { data, error } = await supabase
      .from("merchant_gateways")
      .select(
        "provider, access_token, refresh_token, expires_at, revoked_at, mp_user_id, linked_email, live_mode, updated_at"
      )
      .eq("user_id", uid)
      .eq("provider", "mp")
      .maybeSingle();

    if (error) throw error;

    // Determinar estado
    let connected = false;
    let reason = "not_found";
    const now = Date.now();

    if (data) {
      if (data.revoked_at) {
        connected = false;
        reason = "revoked";
      } else if (!data.access_token) {
        connected = false;
        reason = "missing_access_token";
      } else {
        // Si hay expires_at, validamos que siga vigente
        const expOk =
          !data.expires_at || new Date(data.expires_at).getTime() > now;
        if (!expOk) {
          connected = false;
          reason = "token_expired";
        } else {
          connected = true;
          reason = "ok";
        }
      }
    }

    return res.status(200).json({
      connected,
      reason, // útil para debug en UI
      mp_user_id: data?.mp_user_id || null,
      email: data?.linked_email || null,
      live_mode: !!data?.live_mode,
      updated_at: data?.updated_at || null,
      expires_at: data?.expires_at || null,
      provider: data?.provider || "mp",
    });
  } catch (e) {
    console.error("[api/mp/status] error:", e);
    return res.status(200).json({ connected: false, error: e?.message || String(e) });
  }
}


