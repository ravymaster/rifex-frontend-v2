// src/lib/mpIdentityMatchPolicy.js
// Corrección canónica (2026-08-27) — Mercado Pago como control
// principal del onboarding: Rifex comprueba, cuando la API de Mercado
// Pago lo permite, que el RUT declarado en Rifex coincide con el RUT
// del titular de la cuenta Mercado Pago que recibirá el dinero.
// TRUST-3A permanece como respaldo excepcional, nunca el flujo normal.
//
// Auditoría real de Mercado Pago (esta misma sesión, ver
// docs/trust/MP_IDENTITY_MATCH_AUDIT.md para el detalle completo): no
// fue posible confirmar en vivo si /users/me devuelve un campo de
// identificación (RUT) para Chile — la documentación oficial de
// Mercado Pago bloqueó todos los intentos de acceso automatizado
// (403), y este entorno no tiene credenciales de una app de Mercado
// Pago configuradas para probar contra el sandbox real. Por eso el
// código intenta extraer la identificación de forma defensiva (si el
// campo existe, lo usa; si no, nunca inventa una coincidencia) — ver
// mpIdentityMatchGate.js.
export const MP_MATCH_STATUS = Object.freeze({
  NOT_CONNECTED: 'not_connected',
  CHECKING: 'checking',
  MATCHED: 'matched',
  MISMATCH: 'mismatch',
  UNAVAILABLE: 'unavailable',
  NEEDS_REVIEW: 'needs_review',
  DISCONNECTED: 'disconnected',
});

export const MP_MATCH_RULE_VERSION = 'mp-identity-match-v1.0';

// V1: el control de Mercado Pago solo aplica donde Rifex ya exige RUT
// (hoy, exclusivamente Chile) — mismo alcance que isRutRequiredForCountry
// en trustIdentityPolicy.js. Si el país no exige RUT, tampoco tiene
// sentido exigir que coincida con nada.
export function isMercadoPagoMatchRequiredForCountry(countryCode) {
  return countryCode === 'CL';
}

/**
 * Compara el RUT normalizado de Rifex contra el que (si acaso) entregó
 * Mercado Pago. Nunca asume — si mpRutNormalized es null/undefined,
 * el resultado es 'unavailable', jamás 'matched' ni 'mismatch'.
 */
export function evaluateMpIdentityMatch({ rifexRutNormalized, mpRutNormalized }) {
  if (!rifexRutNormalized) return MP_MATCH_STATUS.NEEDS_REVIEW; // Rifex mismo no tiene RUT declarado todavía
  if (!mpRutNormalized) return MP_MATCH_STATUS.UNAVAILABLE; // MP no entregó el dato — no inventar coincidencia
  return rifexRutNormalized === mpRutNormalized ? MP_MATCH_STATUS.MATCHED : MP_MATCH_STATUS.MISMATCH;
}
