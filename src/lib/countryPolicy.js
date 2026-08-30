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
    // Fuera de operación (ajuste 2026-08-29): devOnly quedó en false a
    // propósito — Argentina ya NO se activa ni siquiera en DEV. No es una
    // reactivación del trabajo internacional; es lo opuesto, cerrar el
    // país por completo hasta nueva decisión explícita. El campo devOnly
    // se conserva (no se borra la infraestructura AR1) para poder
    // reactivarlo con un solo valor cuando corresponda. MP Argentina
    // tampoco tiene adapter real todavía — ver providerRegistry.js
    // (ADAPTER_READY).
    enabled: false, devOnly: false, label: "Argentina", flag: "🇦🇷", currency: "ARS", locale: "es-AR",
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
// absolutas ("/algo"), nunca protocolo-relativas ("//evil.com"),
// absolutas a otro host, esquemas peligrosos (javascript:, data:), ni
// variantes con backslash que algunos navegadores normalizan como "/"
// al resolver una URL relativa contra un origen de esquema especial
// (http/https) -- ese es el vector real detrás de "/\evil.com" o
// "/\\evil.com": el parser WHATWG trata el backslash como separador de
// autoridad, así que "/\evil.com" puede terminar apuntando a
// evil.com. La defensa robusta contra esa clase entera de bypass
// (incluidas variantes que un chequeo de prefijo por string no cubre)
// es resolver el string con el parser real de URL y verificar que el
// origen resultante NUNCA cambió -- no intentar enumerar cada patrón
// de memoria.
//
// Endurecido (auditoría ONBOARDING+BANCOS/MP): el chequeo de prefijo
// original ya bloqueaba "//" y "/\" al inicio, pero no ofrecía ninguna
// garantía sobre variantes menos obvias (control characters, múltiples
// slashes, etc.) -- el enfoque basado en URL() es estrictamente más
// fuerte y es el mismo patrón recomendado por OWASP para "safe
// redirect" (comparar origin, nunca reconstruir a mano).
const SANITIZE_BASE_ORIGIN = "https://internal.rifex.invalid";

export function sanitizeNextPath(raw, fallback = "/panel") {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;

  // Caracteres de control (incluye tab/CR/LF, usados en bypasses reales
  // para confundir parsers de URL más permisivos que el propio
  // navegador) nunca son válidos en una ruta interna legítima.
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return fallback;
  }

  // Debe empezar con exactamente un "/" real -- rechaza de entrada
  // cualquier esquema (https:, javascript:, data:, etc.), cualquier
  // variante protocol-relative ("//evil.com"), y cualquier backslash
  // en la posición donde el parser podría interpretarlo como inicio de
  // autoridad.
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || s.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(s, SANITIZE_BASE_ORIGIN);
    // Si el origen cambió, `s` logró introducir un host/esquema distinto
    // pese a los chequeos de arriba (defensa en profundidad) -- nunca se
    // sigue esa URL.
    if (parsed.origin !== SANITIZE_BASE_ORIGIN) return fallback;
    if (parsed.protocol !== "https:") return fallback;
    const rebuilt = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    // Nunca devolver una ruta vacía o que ya no empiece con "/" tras el
    // parseo (no debería ocurrir dado los chequeos previos, pero es la
    // última línea de defensa antes de confiar en el resultado).
    if (!rebuilt.startsWith("/")) return fallback;
    return rebuilt;
  } catch {
    return fallback;
  }
}
