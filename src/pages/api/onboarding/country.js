// src/pages/api/onboarding/country.js
// Escribe users_profile.country_code para el usuario autenticado (G1).
// Sibling del patrón de src/pages/api/profile/update.js. Nunca toca nombre/
// bio/rut — upsert parcial, solo los campos de esta fila que le
// corresponden a este endpoint.
import { createClient } from "@supabase/supabase-js";
import { isEnabledCountry } from "@/lib/countryPolicy";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const authz = req.headers.authorization || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "missing_auth" });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: "invalid_auth" });
    const uid = ures.user.id;

    const countryCode = String(req.body?.country_code || "").toUpperCase();

    // Autoridad server-side: nunca confiar en que el cliente solo mande
    // países enabled — el onboarding en V1 solo puede dejar guardado un
    // país operable, cualquier otro código (aunque exista en la tabla,
    // como AR/BR/MX/CO/PE/UY) se rechaza acá, no solo en la UI.
    if (!isEnabledCountry(countryCode)) {
      return res.status(400).json({ ok: false, error: "country_not_enabled" });
    }

    const { error: dbErr } = await supabase
      .from("users_profile")
      .upsert({ user_id: uid, country_code: countryCode }, { onConflict: "user_id" });
    if (dbErr) throw dbErr;

    return res.status(200).json({ ok: true, country_code: countryCode });
  } catch (e) {
    console.error("[api/onboarding/country] error", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
