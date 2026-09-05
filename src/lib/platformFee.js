// src/lib/platformFee.js
// EVENT-2 (Fase 7) — fuente neutral de la comision Rifex para Eventos.
// checkout/mp.js y checkout/colecta.js mantienen su propio RIFEX_FEE_RATE
// = 0.07 certificado, sin tocar: centralizar esos dos consumidores hoy
// implicaria tocar codigo entrelazado con Payment Engine no promovido a
// PROD (ver EVENT-1 Fase 10 y EVENT-2 Fase 0), lo que aumenta riesgo sin
// necesidad. Esta es una fuente nueva, de bajo riesgo, usada SOLO por
// Eventos — no una tercera constante hardcoded 0.07 desconectada: el
// mismo valor y la misma formula (Math.floor + clamp) que ya usan los
// otros dos flujos, memorializados en un solo lugar para que Eventos no
// tenga que decidir de nuevo.
export const PLATFORM_FEE_RATE = 0.07;

export function computeEventPlatformFeeCents(subtotalCents) {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error("computeEventPlatformFeeCents: subtotalCents debe ser entero >= 0");
  }
  const raw = Math.floor(subtotalCents * PLATFORM_FEE_RATE);
  return Math.max(0, Math.min(raw, subtotalCents));
}
