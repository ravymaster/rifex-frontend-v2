// src/lib/paymentEngine/providerRegistry.js
// Registro de qué proveedor(es) de pago están PREVISTOS por país — el país
// "conoce" su provider/moneda aunque todavía no haya credenciales reales.
// Separado a propósito de ADAPTER_READY (más abajo), que es la lista de
// combinaciones país+provider con adapter REAL configurado. getAdapter()
// exige estar en ambas listas — un país puede estar "registrado" (AR1) sin
// que eso alcance para que getAdapter() devuelva nada usable todavía.
const REGISTRY = {
  CL: ["mercado_pago"],
  AR: ["mercado_pago"], // AR1: registrado como configuración prevista, sin adapter real — ver ADAPTER_READY
};

const CURRENCY_BY_COUNTRY = {
  CL: "CLP",
  AR: "ARS",
};

// País+provider con adapter/credenciales REALES listos para operar. AR
// queda deliberadamente afuera hasta que exista un MercadoPagoARAdapter
// productivo con credenciales propias (AR2) — sin esto, un país
// "registrado" en REGISTRY caería al adapter genérico de MP sin
// distinguir que no tiene configuración financiera real detrás.
const ADAPTER_READY = {
  CL: ["mercado_pago"],
};

function isAdapterReady(country, provider) {
  return (ADAPTER_READY[country] || []).includes(provider);
}

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
  if (!isAdapterReady(country, provider)) return null; // registrado (REGISTRY) pero sin adapter real todavía
  if (provider === "mercado_pago") return require("./adapters/mercadoPagoAdapter");
  return null;
}

module.exports = {
  getProvidersForCountry,
  getDefaultProvider,
  isProviderAvailable,
  getCurrencyForCountry,
  isAdapterReady,
  getAdapter,
};
