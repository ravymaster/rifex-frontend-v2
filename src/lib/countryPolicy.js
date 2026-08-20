// src/lib/countryPolicy.js
// Única fuente de verdad de países para Rifex (G1 + G2). Módulo puro — sin
// imports de Supabase ni nada server-only — se puede importar tanto desde
// páginas cliente como desde API routes sin traer secretos ni side effects.
//
// V1: solo CL está enabled, con las tres capabilities habilitadas. El resto
// queda modelado (moneda, locale, capabilities todas en false) pero
// deshabilitado — habilitar un país o una capability puntual después es
// solo tocar esta tabla, nunca los endpoints que la consultan (G2:
// countryGate.js / los 5 puntos protegidos).
export const CAPABILITIES = ["raffles", "fundraising", "mercadoPago"];

export const COUNTRY_POLICY = {
  CL: {
    enabled: true, label: "Chile", flag: "🇨🇱", currency: "CLP", locale: "es-CL",
    defaultTimezone: "America/Santiago",
    capabilities: { raffles: true, fundraising: true, mercadoPago: true },
  },
  AR: {
    enabled: false, label: "Argentina", flag: "🇦🇷", currency: "ARS", locale: "es-AR",
    defaultTimezone: "America/Argentina/Buenos_Aires",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false },
  },
  BR: {
    enabled: false, label: "Brasil", flag: "🇧🇷", currency: "BRL", locale: "pt-BR",
    defaultTimezone: "America/Sao_Paulo",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false },
  },
  MX: {
    enabled: false, label: "México", flag: "🇲🇽", currency: "MXN", locale: "es-MX",
    defaultTimezone: "America/Mexico_City",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false },
  },
  CO: {
    enabled: false, label: "Colombia", flag: "🇨🇴", currency: "COP", locale: "es-CO",
    defaultTimezone: "America/Bogota",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false },
  },
  PE: {
    enabled: false, label: "Perú", flag: "🇵🇪", currency: "PEN", locale: "es-PE",
    defaultTimezone: "America/Lima",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false },
  },
  UY: {
    enabled: false, label: "Uruguay", flag: "🇺🇾", currency: "UYU", locale: "es-UY",
    defaultTimezone: "America/Montevideo",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false },
  },
};

export const COUNTRY_CODES = Object.keys(COUNTRY_POLICY);

export function isKnownCountry(code) {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(COUNTRY_POLICY, code);
}

export function isEnabledCountry(code) {
  return isKnownCountry(code) && COUNTRY_POLICY[code].enabled === true;
}

// null/undefined/"" -> falta onboarding. Cualquier código ya guardado
// (aunque sea de un país disabled, no debería poder pasar por el endpoint,
// pero si llegara a existir por otra vía) cuenta como "ya completado".
export function needsCountryOnboarding(countryCode) {
  return !countryCode;
}

// Decisión pura del Country Gate (G2). No toca DB — countryGate.js resuelve
// countryCode contra users_profile y le pasa el resultado acá. Dos motivos
// posibles, nunca un error genérico: 'needs_onboarding' (no hay país
// declarado, o el código es desconocido — mismo remedio: onboarding) vs
// 'country_not_available' (el país es válido pero esa capability puntual
// sigue deshabilitada).
export function evaluateCountryGate(countryCode, capability) {
  if (!countryCode || !isKnownCountry(countryCode)) {
    return { ok: false, reason: "needs_onboarding" };
  }
  const policy = COUNTRY_POLICY[countryCode];
  if (!policy.enabled || policy.capabilities?.[capability] !== true) {
    return { ok: false, reason: "country_not_available" };
  }
  return { ok: true, reason: null };
}

// Sanitiza un `next` recibido por query string: solo rutas internas
// absolutas ("/algo"), nunca protocolo-relativas ("//evil.com") ni
// absolutas a otro host. Mismo criterio que ya usan login.jsx/callback.js,
// centralizado acá para reusarlo también en el onboarding.
export function sanitizeNextPath(raw, fallback = "/panel") {
  const s = String(raw || "");
  if (s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\")) return s;
  return fallback;
}
