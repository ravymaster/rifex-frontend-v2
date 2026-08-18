// src/lib/countryOnboarding.js
// Helper cliente-only (usa el browser client de Supabase, respeta RLS
// owner-only de users_profile) para el chequeo post-login de G1. Centraliza
// la lectura + decisión de redirect para no duplicarla en callback.js,
// login.jsx y panel/index.js.
import { supabaseBrowser as supabase } from "@/lib/supabaseClient";
import { needsCountryOnboarding, sanitizeNextPath } from "@/lib/countryPolicy";

// Devuelve la ruta de onboarding a la que redirigir (con el `next` original
// preservado), o null si el usuario ya tiene país guardado. Si no hay
// sesión activa devuelve null — el chequeo de sesión es responsabilidad de
// quien llama, esta función solo decide sobre país.
export async function resolveCountryOnboardingRedirect(next) {
  const { data: udata } = await supabase.auth.getUser();
  const user = udata?.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users_profile")
    .select("country_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!needsCountryOnboarding(profile?.country_code)) return null;

  const safeNext = sanitizeNextPath(next, "/panel");
  return `/onboarding/pais?next=${encodeURIComponent(safeNext)}`;
}
