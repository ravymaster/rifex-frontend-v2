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

test("país verdaderamente desconocido -> null, nunca un throw silencioso", () => {
  assert.equal(registry.getDefaultProvider("XX"), null);
  assert.equal(registry.getCurrencyForCountry("XX"), null);
  assert.deepEqual(registry.getProvidersForCountry("XX"), []);
  assert.equal(registry.getAdapter("XX", "mercado_pago"), null);
});

test("adapter inexistente -> null (provider no soportado en un país real)", () => {
  assert.equal(registry.getAdapter("CL", "stripe"), null);
});

test("adapter existente -> módulo real de MP (CL)", () => {
  const adapter = registry.getAdapter("CL", "mercado_pago");
  assert.ok(adapter);
  assert.equal(adapter.PROVIDER, "mercado_pago");
});

// AR1: AR queda REGISTRADO (país conoce su provider/moneda previstos) pero
// SIN adapter real listo — getAdapter debe fallar cerrado, nunca devolver
// el adapter de MP genérico/CL por accidente.
test("AR1: AR -> mercado_pago / ARS (registrado como configuración prevista)", () => {
  assert.equal(registry.getDefaultProvider("AR"), "mercado_pago");
  assert.equal(registry.isProviderAvailable("AR", "mercado_pago"), true);
  assert.equal(registry.getCurrencyForCountry("AR"), "ARS");
});

test("AR1: AR está registrado pero NO tiene adapter real -> getAdapter null, nunca el de CL", () => {
  assert.equal(registry.isAdapterReady("AR", "mercado_pago"), false);
  assert.equal(registry.getAdapter("AR", "mercado_pago"), null);
});

test("AR1: CL sigue con adapter real listo, sin cambios", () => {
  assert.equal(registry.isAdapterReady("CL", "mercado_pago"), true);
});
