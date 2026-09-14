// src/lib/paymentEngine/feePolicy.js
// Fee policy por país+provider. El valor 0.07 para CL:mercado_pago es el
// mismo RIFEX_FEE_RATE que ya existe, hardcodeado dos veces, en
// checkout/mp.js y checkout/colecta.js (P1, Fase 1) — acá no se cambia el
// número, solo se centraliza para que ambos endpoints lo consuman del
// mismo lugar. La fórmula (Math.floor + clamp) es idéntica a la que ya
// corre hoy en ambos archivos — ver tests de paridad exacta.
const { isIntegerMinor } = require("./money");

const FEE_RATE_BY_COUNTRY_PROVIDER = {
  "CL:mercado_pago": 0.07,
  // AR:mercado_pago -- no configurar todavía (P2 no toca Argentina)
};

function getPlatformFeeRate(country, provider) {
  const key = `${country}:${provider}`;
  return Object.prototype.hasOwnProperty.call(FEE_RATE_BY_COUNTRY_PROVIDER, key)
    ? FEE_RATE_BY_COUNTRY_PROVIDER[key]
    : null;
}

// amountMinor: el mismo entero que hoy alimenta Math.floor(amount * RATE)
// en los endpoints reales (para CLP eso es pesos enteros, no centavos —
// mismo significado que usa hoy checkout/mp.js/colecta.js, sin reinterpretar
// la unidad). Devuelve null si no hay fee policy para ese país/provider —
// el llamador decide el fallback, esta función nunca inventa una tasa.
function computePlatformFeeMinor(amountMinor, country, provider) {
  const rate = getPlatformFeeRate(country, provider);
  if (rate == null) return null;
  if (!isIntegerMinor(amountMinor)) throw new Error("computePlatformFeeMinor: amountMinor debe ser entero >= 0");
  const raw = Math.floor(amountMinor * rate);
  return Math.max(0, Math.min(raw, amountMinor));
}

module.exports = { getPlatformFeeRate, computePlatformFeeMinor };
