// src/lib/analyticsEvents.js
// Núcleo servidor de la analítica propia (ver
// db/migrations/2026-09-12_admin_analytics_v1.sql para el esquema y el
// razonamiento completo). Única fuente de verdad de qué es un evento
// válido -- el endpoint HTTP (/api/analytics/track) y cualquier futuro
// caller deben pasar por acá, nunca insertar directo a la tabla con un
// payload sin normalizar.
//
// Regla dura, repetida a propósito: este módulo NUNCA acepta ni recalcula
// "payment_approved" -- esa conversión se lee siempre de las tablas de
// pago ya autoritativas (payments/colecta_contributions/event_orders),
// nunca de algo que el navegador pueda declarar. Ver comentario largo en
// la migración.
import { createClient } from "@supabase/supabase-js";
import { getStage } from "./environmentPolicy.js";

// Cliente instanciado perezosamente (no al importar el módulo): así los
// validadores puros de acá abajo (usados directo por tests unitarios vía
// `node --test`, sin variables de entorno de Supabase disponibles) se
// pueden importar sin reventar -- mismo motivo por el que
// src/lib/eventAnalytics.js/registrationPlans.js se mantienen sin ningún
// efecto de módulo. Comportamiento en runtime real (Next.js) idéntico:
// las env vars siempre están presentes ahí.
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _supabase;
}

export const ANALYTICS_MODULES = Object.freeze(["raffle", "campaign", "event", "registration"]);
export const ANALYTICS_EVENT_TYPES = Object.freeze([
  "page_view",
  "cta_click",
  "form_start",
  "form_complete",
  "checkout_start",
]);
const DEVICE_CATEGORIES = Object.freeze(["mobile", "tablet", "desktop", "unknown"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// Nunca se confía en el device_category que mandaría el navegador -- se
// recalcula acá, server-side, a partir del mismo User-Agent que ya llega
// con cualquier request HTTP, sin que el cliente pueda mentir al respecto.
export function classifyDeviceFromUA(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet(?!.*mobile)/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile/.test(ua)) return "mobile";
  if (/android/.test(ua)) return "tablet";
  if (ua.length > 0) return "desktop";
  return "unknown";
}

const BOT_UA_RE = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|semrush|ahrefsbot|mj12bot|pingdom|uptimerobot|headlesschrome/i;

export function classifyTrafficFromUA(userAgent) {
  return BOT_UA_RE.test(String(userAgent || "")) ? "bot" : "human";
}

function truncate(value, maxLen) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

// Nunca guarda la URL completa del referrer (podría llevar tokens/paths
// sensibles de otro sitio) -- solo el hostname, y acotado en largo.
export function sanitizeReferrerHost(referrer) {
  if (!referrer || typeof referrer !== "string") return null;
  try {
    const url = new URL(referrer);
    return truncate(url.hostname, 200);
  } catch {
    return null;
  }
}

export function sanitizeUtmField(value) {
  const t = truncate(value, 100);
  if (!t) return null;
  // Solo caracteres típicos de un UTM real -- nunca HTML/JSON/binario.
  return /^[\w\-.~ %]+$/.test(t) ? t : null;
}

/**
 * Valida un payload crudo de tracking contra el allowlist estricto.
 * Devuelve { ok:true, value } o { ok:false, error }. Nunca lanza.
 */
export function validateTrackPayload(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };

  const { module: mod, entity_id: entityId, event_type: eventType, visitor_id: visitorId } = body;

  if (!ANALYTICS_MODULES.includes(mod)) return { ok: false, error: "invalid_module" };
  if (!isValidUuid(entityId)) return { ok: false, error: "invalid_entity_id" };
  if (!ANALYTICS_EVENT_TYPES.includes(eventType)) return { ok: false, error: "invalid_event_type" };
  if (!isValidUuid(visitorId)) return { ok: false, error: "invalid_visitor_id" };

  return {
    ok: true,
    value: {
      module: mod,
      entity_id: entityId,
      event_type: eventType,
      visitor_id: visitorId,
      utm_source: sanitizeUtmField(body.utm_source),
      utm_medium: sanitizeUtmField(body.utm_medium),
      utm_campaign: sanitizeUtmField(body.utm_campaign),
      referrer_host: sanitizeReferrerHost(body.referrer),
    },
  };
}

/**
 * Inserta un evento ya validado + enriquecido server-side. `extra` nunca
 * viene del payload del navegador (ver /api/analytics/track.js) -- solo
 * este módulo decide si algún día se puebla, y siempre con datos que el
 * propio servidor calculó.
 */
export async function insertAnalyticsEvent(validated, { userAgent } = {}) {
  const row = {
    module: validated.module,
    entity_id: validated.entity_id,
    event_type: validated.event_type,
    visitor_id: validated.visitor_id,
    referrer_host: validated.referrer_host,
    utm_source: validated.utm_source,
    utm_medium: validated.utm_medium,
    utm_campaign: validated.utm_campaign,
    device_category: DEVICE_CATEGORIES.includes(classifyDeviceFromUA(userAgent))
      ? classifyDeviceFromUA(userAgent)
      : "unknown",
    traffic_type: classifyTrafficFromUA(userAgent),
    environment: getStage() === "development" ? "development" : "production",
    extra: null,
  };

  const { error } = await getSupabase().from("analytics_events").insert(row);
  if (error) throw new Error(`analytics_insert_failed: ${error.message}`);
  return true;
}
