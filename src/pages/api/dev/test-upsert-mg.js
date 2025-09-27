// src/pages/api/dev/test-upsert-mg.js
import { createClient } from "@supabase/supabase-js";

const supabaseSR = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    // pásame ?uid=... (uuid de tu usuario; puedes ver el tuyo con /api/dev/whoami)
    const uid = String(req.query.uid || "").trim();
    if (!uid) return res.status(400).json({ ok: false, error: "missing_uid" });

    const upsertRow = {
      user_id: uid,
      provider: "mp",
      status: "connected",
      mp_user_id: "debug-123",
      linked_email: "debug@example.com",
      mp_public_key: "APP_USR-xxxx",
      mp_access_token: "AT-xxxx",
      mp_refresh_token: "RT-xxxx",
      scope: "offline_access read write",
      live_mode: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseSR
      .from("merchant_gateways")
      .upsert(upsertRow, { onConflict: "user_id,provider" })
      .select();

    if (error) {
      console.error("[test-upsert-mg] upsert error:", error);
      return res.status(200).json({ ok: false, step: "upsert", error });
    }
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    console.error("[test-upsert-mg] fatal:", e);
    return res.status(200).json({ ok: false, fatal: String(e) });
  }
}
