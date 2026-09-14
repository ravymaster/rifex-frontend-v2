// src/lib/paymentEngine/contracts.js
// Formas neutrales del Payment Engine. Ningún endpoint financiero actual
// las usa todavía (P1 no migra Chile) — existen para que P2 las adopte.
const { isIntegerMinor } = require("./money");

const STATUSES = ["approved", "rejected", "pending"];

// Lo que se arma ANTES de mandar al comprador/aportante al proveedor.
// Espejo neutral de lo que hoy arma inline checkout/mp.js y checkout/colecta.js.
function createPaymentIntent(fields) {
  const {
    country,
    currency,
    provider,
    productType, // p.ej. 'raffle_ticket' | 'colecta_contribution'
    sellerId,
    externalReference,
    grossAmountMinor,
    platformFeeMinor = 0,
  } = fields || {};

  if (!country || typeof country !== "string") throw new Error("paymentIntent.country requerido");
  if (!currency || typeof currency !== "string") throw new Error("paymentIntent.currency requerido");
  if (!provider || typeof provider !== "string") throw new Error("paymentIntent.provider requerido");
  if (!productType || typeof productType !== "string") throw new Error("paymentIntent.productType requerido");
  if (!sellerId) throw new Error("paymentIntent.sellerId requerido");
  if (!externalReference) throw new Error("paymentIntent.externalReference requerido");
  if (!isIntegerMinor(grossAmountMinor)) throw new Error("paymentIntent.grossAmountMinor debe ser entero >= 0 (unidad menor)");
  if (!isIntegerMinor(platformFeeMinor)) throw new Error("paymentIntent.platformFeeMinor debe ser entero >= 0 (unidad menor)");

  return Object.freeze({
    country,
    currency,
    provider,
    productType,
    sellerId: String(sellerId),
    externalReference: String(externalReference),
    grossAmountMinor,
    platformFeeMinor,
  });
}

// Lo que el proveedor informa sobre un pago ya intentado/resuelto. Espejo
// neutral de lo que hoy extraen inline webhook.js / colectaReconcile.js del
// objeto payment real de MP.
function createProviderPaymentResult(fields) {
  const {
    provider,
    providerPaymentId,
    status,
    grossAmountMinor,
    platformFeeMinor = 0,
    providerFeeMinor = null, // MP no lo reporta separado hoy — ver mapa financiero (Fase 1)
    sellerNetMinor = null,   // no se calcula ni se guarda hoy en ningún flujo real
  } = fields || {};

  if (!provider || typeof provider !== "string") throw new Error("providerPaymentResult.provider requerido");
  if (!providerPaymentId) throw new Error("providerPaymentResult.providerPaymentId requerido");
  if (!STATUSES.includes(status)) throw new Error(`providerPaymentResult.status debe ser uno de ${STATUSES.join("|")}`);
  if (!isIntegerMinor(grossAmountMinor)) throw new Error("providerPaymentResult.grossAmountMinor debe ser entero >= 0 (unidad menor)");
  if (!isIntegerMinor(platformFeeMinor)) throw new Error("providerPaymentResult.platformFeeMinor debe ser entero >= 0 (unidad menor)");
  if (providerFeeMinor !== null && !isIntegerMinor(providerFeeMinor)) throw new Error("providerPaymentResult.providerFeeMinor debe ser entero >= 0 o null");
  if (sellerNetMinor !== null && !Number.isInteger(sellerNetMinor)) throw new Error("providerPaymentResult.sellerNetMinor debe ser entero o null");

  return Object.freeze({
    provider,
    providerPaymentId: String(providerPaymentId),
    status,
    grossAmountMinor,
    platformFeeMinor,
    providerFeeMinor,
    sellerNetMinor,
  });
}

module.exports = { STATUSES, createPaymentIntent, createProviderPaymentResult };
