// src/lib/creationGate.js
// RIFEX PROGRESSIVE ONBOARDING — gate UX server-side compartido por los 3
// puntos de entrada de creación (crear-rifa.jsx, crear-colecta.jsx,
// crear-evento.jsx). Orquesta piezas ya existentes y certificadas, no
// introduce una segunda definición de "elegible":
//   - assertCreatorEligible (trustIdentityGate.js, TRUST-2) sigue siendo
//     la única autoridad — este archivo solo LEE su resultado, nunca
//     reimplementa la regla fail-closed/matched-only.
//   - El destino solicitado se preserva vía `next`, con la misma técnica
//     de saneo (`sanitizeNextPath`, resolución con `new URL()` +
//     comparación de origin) ya reusada en 5 puntos del repo — nunca una
//     segunda implementación.
// Este gate es SOLO UX: la protección autoritativa real sigue viviendo,
// sin cambios, en cada POST de creación (api/rifas/index.js,
// api/colectas/index.js, api/events/index.js), que ya llaman
// assertCreatorEligible por su cuenta — este archivo nunca la reemplaza.
import { getSupabaseServer } from "./supabaseServer.js";
import { assertCreatorEligible } from "./trustIdentityGate.js";

// Mapea cada `reason` real de assertCreatorEligible al paso existente
// que efectivamente lo resuelve. onboarding/identidad básica ->
// /registro/continuar (que ya sabe reanudar desde donde quedó, y ya
// enlaza a /panel/bancos cuando eso es lo único que falta). Mercado
// Pago -> /panel/bancos directo (ya cubre los 5 estados reales:
// desconectado, pendiente, validado, mismatch, no disponible). Fase de
// verificación documental (TRUST-3A) -> /trust/verificar — hoy
// inalcanzable en la práctica porque isIdentityVerificationRequiredForCreators()
// permanece en `false` (ver trustIdentityVerificationPolicy.js), pero se
// mapea igual por completitud si esa política cambiara en el futuro.
const REASON_TO_STEP = {
  onboarding_incomplete: "/registro/continuar",
  onboarding_check_failed: "/registro/continuar",
  identity_incomplete: "/registro/continuar",
  identity_check_failed: "/registro/continuar",
  mp_not_connected: "/panel/bancos",
  mp_identity_mismatch: "/panel/bancos",
  mp_check_pending: "/panel/bancos",
  identity_verification_required: "/trust/verificar",
};

/**
 * resolveCreationGate(ctx, destinationPath)
 * Uso: `export async function getServerSideProps(ctx) { return
 * resolveCreationGate(ctx, "/crear-rifa"); }`
 *
 * destinationPath SIEMPRE es un literal fijo que la propia página pasa
 * (nunca input del usuario) — no requiere sanitización adicional, ya es
 * una ruta interna conocida.
 *
 * Devuelve directamente el resultado esperado por getServerSideProps:
 * `{ redirect }` si falta sesión o elegibilidad, `{ props: {} }` si el
 * usuario ya puede crear.
 */
export async function resolveCreationGate(ctx, destinationPath) {
  const { req, res } = ctx;
  const s = getSupabaseServer(req, res);

  let user = null;
  try {
    const { data } = await s.auth.getUser();
    user = data?.user || null;
  } catch (_) {
    user = null;
  }

  if (!user) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(destinationPath)}`, permanent: false } };
  }

  const elig = await assertCreatorEligible(user.id);
  if (!elig.ok) {
    const step = REASON_TO_STEP[elig.reason] || "/registro/continuar";
    return { redirect: { destination: `${step}?next=${encodeURIComponent(destinationPath)}`, permanent: false } };
  }

  return { props: {} };
}
