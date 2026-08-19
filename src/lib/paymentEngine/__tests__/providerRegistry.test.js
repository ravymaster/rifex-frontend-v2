const test = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../providerRegistry");

test("CL -> mercado_pago (provider correcto)", () => {
  assert.equal(registry.getDefaultProvider("CL"), "mercado_pago");
  assert.equal(registry.isProviderAvailable("CL", "mercado_pago"), true);
});

test("CL -> CLP", () => {
  assert.equal(registry.getCurrencyForCountry("CL"), "CLP");
});

test("país desconocido / sin provider configurado -> null, nunca un throw silencioso", () => {
  assert.equal(registry.getDefaultProvider("AR"), null);
  assert.equal(registry.getDefaultProvider("XX"), null);
  assert.equal(registry.getCurrencyForCountry("AR"), null);
  assert.deepEqual(registry.getProvidersForCountry("AR"), []);
});

test("adapter inexistente -> null (país sin provider, o provider no soportado)", () => {
  assert.equal(registry.getAdapter("AR", "mercado_pago"), null);
  assert.equal(registry.getAdapter("CL", "stripe"), null);
});

test("adapter existente -> módulo real de MP", () => {
  const adapter = registry.getAdapter("CL", "mercado_pago");
  assert.ok(adapter);
  assert.equal(adapter.PROVIDER, "mercado_pago");
});
