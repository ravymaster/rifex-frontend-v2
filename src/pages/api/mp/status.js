// src/pages/api/mp/status.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
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

    const uid = String(req.query.uid || "").trim();
    if (!uid) {
      return res.status(400).json({ connected: false, error: "missing_uid" });
    }

    const { data, error } = await supabase
      .from("merchant_gateways")
      .select(`
        provider,
        access_token,
        mp_access_token,
        revoked_at,
        mp_user_id,
        linked_email,
        live_mode,
        updated_at,
        expires_at
      `)
      .eq("user_id", uid)
      .eq("provider", "mp")
      .maybeSingle();

    if (error) throw error;

    let connected = false;
    let reason = "not_found";

    if (data) {
      const token = data.access_token || data.mp_access_token || null;
      const now = Date.now();

      if (data.revoked_at) {
        connected = false;
        reason = "revoked";
      } else if (!token) {
        connected = false;
        reason = "missing_access_token";
      } else {
        const notExpired = !data.expires_at || new Date(data.expires_at).getTime() > now;
        connected = !!notExpired;
        reason = notExpired ? "ok" : "token_expired";
      }
    }

    return res.status(200).json({
      connected,
      reason,
      provider: data?.provider || "mp",
      mp_user_id: data?.mp_user_id || null,
      email: data?.linked_email || null,
      live_mode: !!data?.live_mode,
      updated_at: data?.updated_at || null,
      expires_at: data?.expires_at || null,
    });
  } catch (e) {
    console.error("[api/mp/status] error:", e);
    return res.status(200).json({ connected: false, error: e?.message || String(e) });
  }
}






