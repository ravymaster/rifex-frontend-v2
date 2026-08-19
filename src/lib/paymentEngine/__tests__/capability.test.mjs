// Único test del set que importa código real fuera de paymentEngine/ —
// evaluateCountryGate de countryPolicy.js (G2, ya certificado, sin tocar).
// Archivo .mjs porque countryPolicy.js usa ESM y este test corre con
// `node --test` sin transpilar nada ni agregar herramientas nuevas.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCountryGate } from "../../countryPolicy.js";

test("CL con mercadoPago habilitada -> ok", () => {
  const r = evaluateCountryGate("CL", "mercadoPago");
  assert.equal(r.ok, true);
});

test("capability deshabilitada (AR, país conocido pero sin ninguna capability activa) -> country_not_available", () => {
  const r = evaluateCountryGate("AR", "mercadoPago");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "country_not_available");
});

test("país desconocido -> needs_onboarding", () => {
  const r = evaluateCountryGate("XX", "mercadoPago");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "needs_onboarding");
});

test("sin país (null) -> needs_onboarding", () => {
  const r = evaluateCountryGate(null, "mercadoPago");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "needs_onboarding");
});
