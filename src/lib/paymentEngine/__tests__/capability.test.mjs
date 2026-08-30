// Único test del set que importa código real fuera de paymentEngine/ —
// evaluateCountryGate de countryPolicy.js (G2, ya certificado, sin tocar).
// Archivo .mjs porque countryPolicy.js usa ESM y este test corre con
// `node --test` sin transpilar nada ni agregar herramientas nuevas.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCountryGate, isCountryActive } from "../../countryPolicy.js";

test("CL con mercadoPago habilitada -> ok", () => {
  const r = evaluateCountryGate("CL", "mercadoPago");
  assert.equal(r.ok, true);
});

test("AR1 fail-safe: sin NEXT_PUBLIC_STAGE=development, AR sigue inactivo (país devOnly, no PROD-enabled) -> country_not_available", () => {
  assert.equal(isCountryActive("AR"), false);
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
