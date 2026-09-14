// src/lib/paymentEngine/countryRouter.js
// País operativo = el del SELLER, ya verificado server-side — nunca el que
// mande el comprador/frontend. Reutiliza evaluateCountryGate (misma
// autoridad que usa countryGate.js) para la decisión de capability; no la
// duplica ni la modifica. La lectura de country_code de acá es la misma
// consulta trivial que ya hace countryGate.js, repetida porque ese archivo
// es lógica certificada (G2) y P1 no la toca ni la envuelve.
import { createClient } from "@supabase/supabase-js";
import { evaluateCountryGate } from "@/lib/countryPolicy";
import { getDefaultProvider, getCurrencyForCountry } from "./providerRegistry";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function routeSellerToProvider(sellerId, capability) {
  if (!sellerId) return { ok: false, reason: "needs_onboarding" };

  const { data: profile } = await supabase
    .from("users_profile")
    .select("country_code")
    .eq("user_id", sellerId)
    .maybeSingle();

  const country = profile?.country_code ?? null;
  const gate = evaluateCountryGate(country, capability);
  if (!gate.ok) return { ok: false, reason: gate.reason, country };

  const provider = getDefaultProvider(country);
  if (!provider) return { ok: false, reason: "provider_not_configured", country };

  return { ok: true, country, provider, currency: getCurrencyForCountry(country) };
}
