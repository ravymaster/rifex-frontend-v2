// src/lib/paymentEngine/adapters/mercadoPagoAdapter.js
// Normaliza objetos reales de la API de pagos de MP a los contratos
// neutrales. Puramente funcional: no hace fetch, no lee env vars, no toca
// secretos ni DB — solo transforma datos que ya se le pasan. Ningún
// endpoint financiero actual lo llama todavía (P1 no migra Chile).
const { toMinorFromDecimal } = require("../money");
const { normalizeProviderStatus } = require("../statusNormalizer");
const { createProviderPaymentResult } = require("../contracts");

const PROVIDER = "mercado_pago";

function normalizeStatus(rawStatus) {
  return normalizeProviderStatus(PROVIDER, rawStatus);
}

// Misma extracción que ya hacen webhook.js / reconcile-payments.js /
// colectaReconcile.js: fee_details.find(type === 'application_fee').
function extractPlatformFeeMinor(mpPaymentObject) {
  const fee = Array.isArray(mpPaymentObject?.fee_details)
    ? mpPaymentObject.fee_details.find((f) => f?.type === "application_fee")
    : null;
  return fee ? toMinorFromDecimal(fee.amount) : 0;
}

function extractGrossAmountMinor(mpPaymentObject) {
  return toMinorFromDecimal(mpPaymentObject?.transaction_amount);
}

// providerFeeMinor y sellerNetMinor quedan null a propósito: MP no reporta
// la comisión propia separada en este objeto, y ningún flujo actual calcula
// ni guarda seller_net — ver hallazgo en el mapa financiero de Fase 1.
function toProviderPaymentResult(mpPaymentObject) {
  return createProviderPaymentResult({
    provider: PROVIDER,
    providerPaymentId: mpPaymentObject?.id,
    status: normalizeStatus(mpPaymentObject?.status),
    grossAmountMinor: extractGrossAmountMinor(mpPaymentObject),
    platformFeeMinor: extractPlatformFeeMinor(mpPaymentObject),
    providerFeeMinor: null,
    sellerNetMinor: null,
  });
}

module.exports = {
  PROVIDER,
  normalizeStatus,
  extractPlatformFeeMinor,
  extractGrossAmountMinor,
  toProviderPaymentResult,
};
