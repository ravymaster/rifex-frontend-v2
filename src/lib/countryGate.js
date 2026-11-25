// src/lib/countryGate.js
// Country Gate server-side (G2). Sibling del patrón de colectaReconcile.js:
// la decisión pura vive en countryPolicy.js, acá solo se resuelve el
// country_code REAL contra users_profile (nunca el que mande el cliente
// por body/query/header/cookie) y se traduce a un mensaje que ya es seguro
// mostrarle al usuario final, sin códigos técnicos.
import { createClient } from "@supabase/supabase-js";
import { evaluateCountryGate } from "@/lib/countryPolicy";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const USER_MESSAGE = {
  needs_onboarding: "Antes de continuar, dinos en qué país operarás con Rifex.",
  country_not_available:
    "Rifex todavía no está disponible para crear y recaudar en tu país. Estamos preparando su lanzamiento.",
};

// userId: SIEMPRE el id resuelto server-side (sesión verificada, o
// creator_id ya leído de la fila de la rifa/colecta — nunca un id que
// venga directo del body/query de la request en curso).
export async function assertCountryGate(userId, capability) {
  if (!userId) {
    return { ok: false, reason: "needs_onboarding", message: USER_MESSAGE.needs_onboarding };
  }

  const { data: profile } = await supabase
    .from("users_profile")
    .select("country_code")
    .eq("user_id", userId)
    .maybeSingle();

  const result = evaluateCountryGate(profile?.country_code ?? null, capability);
  if (result.ok) return { ok: true };

  return { ok: false, reason: result.reason, message: USER_MESSAGE[result.reason] };
}
