// src/lib/consent.js
// Consentimiento mínimo de marketing (Meta Pixel). Módulo puro, client-only
// — nada de esto corre server-side, no hay autoridad de servidor que
// depender acá, es solo la decisión del usuario en su propio navegador.
const CONSENT_KEY = "rifex_marketing_consent";

// null = todavía no decidió (mostrar el banner). 'granted' | 'denied' = ya
// decidió, se recuerda entre visitas.
export function getStoredConsent() {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setStoredConsent(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // localStorage bloqueado (modo privado extremo, etc.) — no es
    // financiero ni crítico, se ignora silenciosamente.
  }
}
