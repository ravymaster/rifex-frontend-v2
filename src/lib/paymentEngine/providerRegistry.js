// src/lib/paymentEngine/providerRegistry.js
// Registro de qué proveedor(es) de pago están disponibles por país. Hoy
// solo CL -> mercado_pago está configurado. Argentina NO se configura en
// este sprint (ver P1 spec) — queda documentado como comentario, no como
// entrada activa, para no crear ninguna credencial ni ruta AR todavía.
const REGISTRY = {
  CL: ["mercado_pago"],
  // AR: ["mercado_pago"], // futuro (P2+) — no activar sin credenciales reales
};

const CURRENCY_BY_COUNTRY = {
  CL: "CLP",
  // AR: "ARS", // futuro (P2+)
};

function getProvidersForCountry(country) {
  return REGISTRY[country] || [];
}

function getDefaultProvider(country) {
  const list = getProvidersForCountry(country);
  return list[0] || null;
}

function isProviderAvailable(country, provider) {
  return getProvidersForCountry(country).includes(provider);
}

function getCurrencyForCountry(country) {
  return CURRENCY_BY_COUNTRY[country] || null;
}

function getAdapter(country, provider) {
  if (!isProviderAvailable(country, provider)) return null;
  if (provider === "mercado_pago") return require("./adapters/mercadoPagoAdapter");
  return null;
}

module.exports = {
  getProvidersForCountry,
  getDefaultProvider,
  isProviderAvailable,
  getCurrencyForCountry,
  getAdapter,
};
