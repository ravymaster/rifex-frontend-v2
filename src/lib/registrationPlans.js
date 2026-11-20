// src/lib/registrationPlans.js
// INSCRIPCIONES V1 — única autoridad de capacidades por plan, para que
// 50/200/2000 nunca queden repetidos mágicamente por el código. La
// autoridad REAL e inescapable de "qué plan y qué capacidad tiene una
// actividad" vive en la RPC create_free_registration_activity (SQL,
// db/migrations/2026-09-04_inscripciones1_foundation.sql) — esa función
// ni siquiera acepta plan/capacity como parámetro, los hardcodea. Este
// módulo es la vista de solo lectura que el resto del código (API, UI)
// usa para presentar información, nunca para decidir un valor.
//
// V1 FREE: create_free_registration_activity solo puede escribir
// plan='free'. PLUS/GOLD están modelados acá (para que un futuro
// mission de facturación no tenga que inventar los números otra vez),
// pero NINGÚN endpoint de esta misión los activa — no existe
// create_plus_registration_activity ni create_gold_registration_activity,
// no existe checkout, no existe forma de que un cliente pida
// plan=plus/gold y obtenga esa capacidad. Ver
// docs/inscripciones/INSCRIPCIONES_FUTURE_BILLING.md para el punto
// exacto de integración futura.

export const REGISTRATION_PLANS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    capacity: 50,
    purchaseRequired: false,
    publiclyAvailable: true,
  }),
  plus: Object.freeze({
    id: 'plus',
    capacity: 200,
    purchaseRequired: true,
    publiclyAvailable: false,
  }),
  gold: Object.freeze({
    id: 'gold',
    capacity: 2000,
    purchaseRequired: true,
    publiclyAvailable: false,
  }),
});

export function capacityForPlan(plan) {
  return REGISTRATION_PLANS[plan]?.capacity ?? null;
}

export function isPubliclyAvailablePlan(plan) {
  return REGISTRATION_PLANS[plan]?.publiclyAvailable === true;
}

// Planes que un usuario puede ver/elegir en V1 — hoy solo FREE. Cuando el
// futuro mission de facturación active Plus/Gold, este filtro (no una
// lista hardcodeada en cada página) es lo único que debería cambiar para
// que la UI los muestre.
export function listPubliclyAvailablePlans() {
  return Object.values(REGISTRATION_PLANS).filter((p) => p.publiclyAvailable);
}
