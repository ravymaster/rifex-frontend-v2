// src/lib/analyticsClient.js
// Cliente mínimo de la analítica propia -- llamado desde las páginas
// públicas de Rifas/Campañas/Eventos/Inscripciones (nunca desde
// checkout/webhook, nunca declara pagos). Mismo criterio de
// pseudonimización que src/lib/medidorQrVisitor.js: localStorage, nunca
// ligado a auth.users, deliberadamente no robusto contra localStorage
// limpiado (la deduplicación real, si alguna vez se necesita, vive
// server-side).
const STORAGE_KEY = "rifex_analytics_visitor_id";

function getOrCreateVisitorId() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // localStorage indisponible (incógnito estricto, storage lleno): se
    // genera un id efímero solo para esta carga de página, sin romper el
    // resto de la UI por esto.
    return crypto.randomUUID();
  }
}

function utmFromLocation() {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source") || undefined,
      utm_medium: params.get("utm_medium") || undefined,
      utm_campaign: params.get("utm_campaign") || undefined,
    };
  } catch {
    return {};
  }
}

// Evita reenviar el mismo (module, entity_id, event_type) más de una vez
// por carga de página -- protege contra un re-render disparando el mismo
// useEffect dos veces (ej. React StrictMode en desarrollo), no es
// deduplicación de fondo (esa, si hiciera falta, sería server-side).
const sentThisPageLoad = new Set();

/**
 * Dispara un evento de analítica propia. Nunca lanza -- un fallo de red o
 * del endpoint jamás debe afectar la página pública que lo llama.
 */
export function trackEvent({ module, entityId, eventType }) {
  if (typeof window === "undefined") return;
  if (!module || !entityId || !eventType) return;

  const dedupeKey = `${module}:${entityId}:${eventType}`;
  if (eventType === "page_view" && sentThisPageLoad.has(dedupeKey)) return;
  sentThisPageLoad.add(dedupeKey);

  const visitorId = getOrCreateVisitorId();
  if (!visitorId) return;

  const payload = {
    module,
    entity_id: entityId,
    event_type: eventType,
    visitor_id: visitorId,
    referrer: document.referrer || undefined,
    ...utmFromLocation(),
  };

  try {
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Silencioso a propósito -- ver comentario de la función.
  }
}
