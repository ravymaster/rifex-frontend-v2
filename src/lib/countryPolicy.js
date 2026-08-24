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
//
// AR1: `enabled` NUNCA cambia de significado — sigue siendo "habilitado en
// todos los entornos", exactamente como hoy. Un país puede además llevar
// `devOnly: true`, que solo lo activa cuando isDevStage() es true (ver
// isCountryActive más abajo) — nunca en PROD, sin importar el valor de
// `enabled`. Un solo objeto, sin duplicar la tabla por entorno.
import { isDevStage } from "./environmentPolicy.js";

// EVENT-1: agrega la capability "events" — Chile únicamente. Argentina
// queda explícitamente en false pese a estar devOnly-activa para las otras
// tres capabilities: EVENT-1 no debe habilitar Eventos para ningún país
// fuera de Chile, y mucho menos arrastrar a Argentina sin que sea una
// decisión propia (no promovida, ver AR1/AR2).
export const CAPABILITIES = ["raffles", "fundraising", "mercadoPago", "events"];

export const COUNTRY_POLICY = {
  CL: {
    enabled: true, label: "Chile", flag: "🇨🇱", currency: "CLP", locale: "es-CL",
    defaultTimezone: "America/Santiago",
    capabilities: { raffles: true, fundraising: true, mercadoPago: true, events: true },
  },
  AR: {
    // Solo activo cuando isDevStage() es true (ver isCountryActive). MP
    // Argentina todavía no tiene adapter real — ver providerRegistry.js
    // (ADAPTER_READY) — así que aunque el país esté activo, el Payment
    // Engine se detiene limpio antes de intentar cobrar.
    enabled: false, devOnly: true, label: "Argentina", flag: "🇦🇷", currency: "ARS", locale: "es-AR",
    defaultTimezone: "America/Argentina/Buenos_Aires",
    capabilities: { raffles: true, fundraising: true, mercadoPago: true, events: false },
  },
  BR: {
    enabled: false, label: "Brasil", flag: "🇧🇷", currency: "BRL", locale: "pt-BR",
    defaultTimezone: "America/Sao_Paulo",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false, events: false },
  },
  MX: {
    enabled: false, label: "México", flag: "🇲🇽", currency: "MXN", locale: "es-MX",
    defaultTimezone: "America/Mexico_City",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false, events: false },
  },
  CO: {
    enabled: false, label: "Colombia", flag: "🇨🇴", currency: "COP", locale: "es-CO",
    defaultTimezone: "America/Bogota",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false, events: false },
  },
  PE: {
    enabled: false, label: "Perú", flag: "🇵🇪", currency: "PEN", locale: "es-PE",
    defaultTimezone: "America/Lima",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false, events: false },
  },
  UY: {
    enabled: false, label: "Uruguay", flag: "🇺🇾", currency: "UYU", locale: "es-UY",
    defaultTimezone: "America/Montevideo",
    capabilities: { raffles: false, fundraising: false, mercadoPago: false, events: false },
  },
};

export const COUNTRY_CODES = Object.keys(COUNTRY_POLICY);

export function isKnownCountry(code) {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(COUNTRY_POLICY, code);
}

// Único punto donde "enabled" se evalúa junto con "devOnly". `enabled` puro
// (el campo) nunca se lee en otro lado — todo pasa por acá, así que hay un
// solo lugar que sabe qué significa "activo ahora mismo".
export function isCountryActive(code) {
  if (!isKnownCountry(code)) return false;
  const policy = COUNTRY_POLICY[code];
  if (policy.enabled === true) return true;
  return policy.devOnly === true && isDevStage();
}

export function isEnabledCountry(code) {
  return isCountryActive(code);
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
  if (!isCountryActive(countryCode) || policy.capabilities?.[capability] !== true) {
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
