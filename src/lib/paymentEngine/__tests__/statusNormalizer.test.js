const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProviderStatus } = require("../statusNormalizer");

test("normalizeProviderStatus: approved -> approved", () => {
  assert.equal(normalizeProviderStatus("mercado_pago", "approved"), "approved");
});

test("normalizeProviderStatus: rejected/cancelled -> rejected", () => {
  assert.equal(normalizeProviderStatus("mercado_pago", "rejected"), "rejected");
  assert.equal(normalizeProviderStatus("mercado_pago", "cancelled"), "rejected");
});

test("normalizeProviderStatus: pending/in_process/authorized -> pending", () => {
  assert.equal(normalizeProviderStatus("mercado_pago", "pending"), "pending");
  assert.equal(normalizeProviderStatus("mercado_pago", "in_process"), "pending");
  assert.equal(normalizeProviderStatus("mercado_pago", "authorized"), "pending");
});

test("normalizeProviderStatus: status desconocido de MP -> pending (fail-safe, nunca approved)", () => {
  assert.equal(normalizeProviderStatus("mercado_pago", "algo_nuevo_que_mp_invente"), "pending");
});

test("normalizeProviderStatus: provider no soportado -> throw", () => {
  assert.throws(() => normalizeProviderStatus("stripe", "approved"));
});
