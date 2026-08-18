// src/lib/countryPolicy.js
// Única fuente de verdad de países para Rifex (G1). Módulo puro — sin
// imports de Supabase ni nada server-only — se puede importar tanto desde
// páginas cliente como desde API routes sin traer secretos ni side effects.
//
// V1: solo CL está enabled. El resto queda modelado (moneda, locale) pero
// deshabilitado — habilitarlos después no debería requerir tocar Rifas ni
// Campañas, solo flipear `enabled` acá y (en la fase de Country Gate) los
// puntos que ya consultan esta tabla.
export const COUNTRY_POLICY = {
  CL: { enabled: true, label: "Chile", flag: "🇨🇱", currency: "CLP", locale: "es-CL" },
  AR: { enabled: false, label: "Argentina", flag: "🇦🇷", currency: "ARS", locale: "es-AR" },
  BR: { enabled: false, label: "Brasil", flag: "🇧🇷", currency: "BRL", locale: "pt-BR" },
  MX: { enabled: false, label: "México", flag: "🇲🇽", currency: "MXN", locale: "es-MX" },
  CO: { enabled: false, label: "Colombia", flag: "🇨🇴", currency: "COP", locale: "es-CO" },
  PE: { enabled: false, label: "Perú", flag: "🇵🇪", currency: "PEN", locale: "es-PE" },
  UY: { enabled: false, label: "Uruguay", flag: "🇺🇾", currency: "UYU", locale: "es-UY" },
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

// Sanitiza un `next` recibido por query string: solo rutas internas
// absolutas ("/algo"), nunca protocolo-relativas ("//evil.com") ni
// absolutas a otro host. Mismo criterio que ya usan login.jsx/callback.js,
// centralizado acá para reusarlo también en el onboarding.
export function sanitizeNextPath(raw, fallback = "/panel") {
  const s = String(raw || "");
  if (s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\")) return s;
  return fallback;
}
