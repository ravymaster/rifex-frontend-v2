const test = require("node:test");
const assert = require("node:assert/strict");
const { createPaymentIntent, createProviderPaymentResult } = require("../contracts");

const validIntent = {
  country: "CL",
  currency: "CLP",
  provider: "mercado_pago",
  productType: "raffle_ticket",
  sellerId: "seller-1",
  externalReference: "purchase-1",
  grossAmountMinor: 100000,
  platformFeeMinor: 7000,
};

test("createPaymentIntent: shape válido pasa y queda congelado", () => {
  const intent = createPaymentIntent(validIntent);
  assert.equal(intent.country, "CL");
  assert.equal(intent.currency, "CLP");
  assert.equal(Object.isFrozen(intent), true);
  intent.grossAmountMinor = 1; // no-op en modo no estricto; el freeze real se valida arriba
  assert.equal(intent.grossAmountMinor, 100000);
});

test("createPaymentIntent: rechaza montos con floats (cantidades enteras)", () => {
  assert.throws(() => createPaymentIntent({ ...validIntent, grossAmountMinor: 1000.5 }));
});

test("createPaymentIntent: rechaza campos obligatorios ausentes", () => {
  assert.throws(() => createPaymentIntent({ ...validIntent, sellerId: undefined }));
  assert.throws(() => createPaymentIntent({ ...validIntent, externalReference: undefined }));
  assert.throws(() => createPaymentIntent({ ...validIntent, country: undefined }));
});

const validResult = {
  provider: "mercado_pago",
  providerPaymentId: "123456",
  status: "approved",
  grossAmountMinor: 100000,
  platformFeeMinor: 7000,
};

test("createProviderPaymentResult: shape válido pasa", () => {
  const r = createProviderPaymentResult(validResult);
  assert.equal(r.status, "approved");
});

test("createProviderPaymentResult: rechaza status fuera del set neutral", () => {
  assert.throws(() => createProviderPaymentResult({ ...validResult, status: "cancelled" }));
});
