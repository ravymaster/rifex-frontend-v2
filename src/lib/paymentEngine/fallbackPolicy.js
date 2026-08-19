// src/lib/paymentEngine/fallbackPolicy.js
// Único punto de decisión para qué hacer cuando el motor no puede resolver
// country/currency/provider para un seller. checkout/mp.js y
// checkout/colecta.js llaman a esto en vez de duplicar la decisión.
//
// Regla AR2, no negociable: un país no-CL sin configuración lista NUNCA
// cae al comportamiento legado de Chile. Solo CL (o país no determinado,
// que hoy solo puede pasar con datos legado/incompletos) puede usar el
// fallback — así P2 sigue funcionando exactamente igual para Chile.
function resolveFallbackDecision(routed) {
  if (routed && routed.ok) return "use_engine";
  const country = routed && routed.country ? routed.country : null;
  if (!country || country === "CL") return "fallback_cl";
  return "fail_closed";
}

module.exports = { resolveFallbackDecision };
