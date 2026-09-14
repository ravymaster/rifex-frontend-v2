// src/lib/metaPixel.js
// Meta Pixel — carga y tracking mínimos, siempre detrás de consentimiento
// (nunca se llama desde acá si el usuario no aceptó, ver _app.js). No se
// modifica la lógica interna del snippet oficial de Meta (fbq), solo se
// controla CUÁNDO se ejecuta.
//
// Nunca se manda PII ni datos financieros: ningún evento de este archivo
// recibe email/nombre/teléfono/RUT/user_id/payment_id/montos/datos de
// Mercado Pago como parámetro — trackPageView() no manda ningún dato
// propio de Rifex, y trackMetaEvent() es responsabilidad del caller (no
// se activa ningún evento comercial todavía, solo queda listo para el
// futuro).
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

let initialized = false;

export function isMetaPixelConfigured() {
  return typeof PIXEL_ID === "string" && PIXEL_ID.length > 0;
}

// Snippet oficial de Meta (sin alterar), envuelto para que solo se
// ejecute una vez y solo cuando alguien con consentimiento lo pida.
export function initMetaPixel() {
  if (initialized) return;
  if (typeof window === "undefined" || !isMetaPixelConfigured()) return;
  if (typeof window.fbq === "function") {
    initialized = true;
    return;
  }

  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */

  window.fbq("init", PIXEL_ID);
  initialized = true;
}

export function trackPageView() {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", "PageView");
}

// Helper genérico para eventos futuros — no se invoca desde ningún lado
// todavía. El caller es responsable de nunca pasar PII ni datos
// financieros en `params`.
export function trackMetaEvent(name, params = {}) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (!name) return;
  window.fbq("track", name, params);
}
