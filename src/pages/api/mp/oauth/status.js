// src/pages/api/mp/status.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  // Para leer con RLS respetado vale el anon;
  // si prefieres SERVICE_ROLE, úsalo y añade auth de tu app.
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    // Acepta uid por query o usa la sesión (si la tienes en cookies de supabase)
    const uid = (req.query.uid || "").trim();
    let userId = uid;

    if (!userId) {
      // intenta leer user desde la cookie de supabase (si la tienes configurada)
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id || null;
    }

    if (!userId) {
      return res.status(200).json({ connected: false, reason: "no_user" });
    }

    // ¿existe vínculo “activo”?
    const { data, error } = await supabase
      .from("mp_links")
      .select("mp_user_id, linked_email, revoked_at")
      .eq("user_id", userId)
      .eq("provider", "mp")
      .maybeSingle();

    if (error) throw error;

    const connected = !!(data && !data.revoked_at);
    return res.status(200).json({
      connected,
      mp_user_id: data?.mp_user_id || null,
      email: data?.linked_email || null,
    });
  } catch (e) {
    console.error("[mp/status] error:", e);
    return res.status(200).json({ connected: false, error: String(e?.message || e) });
  }
}
