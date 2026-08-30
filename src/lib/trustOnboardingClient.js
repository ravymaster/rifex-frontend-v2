// src/lib/trustOnboardingClient.js
// TRUST-1 — helper cliente-only, mismo rol que src/lib/countryOnboarding.js
// (centraliza el chequeo post-login para no duplicarlo en callback.js,
// panel/index.js, crear-rifa.jsx, crear-evento.jsx, crear-colecta.jsx).
//
// Diferencia deliberada respecto de countryOnboarding.js: ese helper lee
// users_profile DIRECTO vía el browser client (RLS owner-only lo
// permite, la tabla es de baja sensibilidad). trust_onboarding en cambio
// tiene RLS default-deny total (ver la migración) — este helper nunca
// toca la tabla directo, siempre pasa por GET /api/onboarding/trust/status
// con el Bearer token de la sesión, igual que cualquier lectura owner-only
// de Eventos (ver orders-summary.js). Mismo resultado para quien lo
// llama, ruta de datos más estricta por debajo.
import { supabaseBrowser as supabase } from '@/lib/supabaseClient';
import { sanitizeNextPath } from '@/lib/countryPolicy';

/**
 * Devuelve la ruta de onboarding de Trust a la que redirigir (con `next`
 * preservado), o null si el usuario ya lo completó o si no hay sesión
 * activa (el chequeo de sesión es responsabilidad de quien llama).
 */
export async function resolveTrustOnboardingRedirect(next) {
  const { data: sdata } = await supabase.auth.getSession();
  const token = sdata?.session?.access_token;
  if (!token) return null;

  try {
    const res = await fetch('/api/onboarding/trust/status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null; // fail-open en el helper de navegación — la autoridad real es el server-side gate en cada API sensible, esto solo mejora la UX
    const data = await res.json();
    if (!data?.ok) return null;
    // Corrección canónica (2026-08-27): el cierre real ahora incluye
    // Mercado Pago — `data.complete` solo describe TRUST-1, ya no basta
    // para decidir si mandar (o no) al usuario de vuelta a
    // /registro/continuar (que ahora también muestra el paso de
    // conectar Mercado Pago cuando falta).
    if (data.onboarding_complete_for_creators) return null;
  } catch {
    return null;
  }

  const safeNext = sanitizeNextPath(next, '/panel');
  return `/registro/continuar?next=${encodeURIComponent(safeNext)}`;
}
