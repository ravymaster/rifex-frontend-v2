const test = require("node:test");
const assert = require("node:assert/strict");
const adapter = require("../adapters/mercadoPagoAdapter");

const samplePayment = {
  id: 987654321,
  status: "approved",
  transaction_amount: 1000,
  fee_details: [{ type: "application_fee", amount: 70 }],
};

test("extractGrossAmountMinor: 1000 CLP -> 100000 (unidad entera menor)", () => {
  assert.equal(adapter.extractGrossAmountMinor(samplePayment), 100000);
});

test("extractPlatformFeeMinor: toma application_fee de fee_details", () => {
  assert.equal(adapter.extractPlatformFeeMinor(samplePayment), 7000);
});

test("extractPlatformFeeMinor: sin fee_details -> 0, no null ni NaN", () => {
  assert.equal(adapter.extractPlatformFeeMinor({ transaction_amount: 1000 }), 0);
});

test("normalizeStatus delega en statusNormalizer", () => {
  assert.equal(adapter.normalizeStatus("approved"), "approved");
  assert.equal(adapter.normalizeStatus("rejected"), "rejected");
});

test("toProviderPaymentResult produce un contrato neutral válido", () => {
  const result = adapter.toProviderPaymentResult(samplePayment);
  assert.equal(result.provider, "mercado_pago");
  assert.equal(result.providerPaymentId, "987654321");
  assert.equal(result.status, "approved");
  assert.equal(result.grossAmountMinor, 100000);
  assert.equal(result.platformFeeMinor, 7000);
  assert.equal(result.providerFeeMinor, null);
  assert.equal(result.sellerNetMinor, null);
});
