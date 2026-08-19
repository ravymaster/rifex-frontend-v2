// AR1: prueba el fail-safe de isCountryActive/evaluateCountryGate hacia
// producción. environmentPolicy.js lee NEXT_PUBLIC_STAGE UNA sola vez al
// cargar el módulo (const de nivel de módulo) — por eso este archivo se
// corre en un proceso `node --test` APARTE, con NEXT_PUBLIC_STAGE=development
// seteado ANTES de arrancar node (ver comando en el informe). No se puede
// mezclar con capability.test.mjs (que corre sin la variable) en el mismo
// proceso sin ese cuidado.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCountryGate, isCountryActive } from "../../countryPolicy.js";

test("precondición: este archivo corre con NEXT_PUBLIC_STAGE=development", () => {
  assert.equal(process.env.NEXT_PUBLIC_STAGE, "development");
});

test("AR1: AR se activa en DEV (isCountryActive)", () => {
  assert.equal(isCountryActive("AR"), true);
});

test("AR1: CL sigue activo en DEV, sin cambios", () => {
  assert.equal(isCountryActive("CL"), true);
});

test("AR1: evaluateCountryGate('AR','raffles'|'fundraising'|'mercadoPago') -> ok en DEV", () => {
  assert.equal(evaluateCountryGate("AR", "raffles").ok, true);
  assert.equal(evaluateCountryGate("AR", "fundraising").ok, true);
  assert.equal(evaluateCountryGate("AR", "mercadoPago").ok, true);
});

test("AR1: países sin devOnly siguen inactivos en DEV (BR no se habilitó por accidente)", () => {
  assert.equal(isCountryActive("BR"), false);
  assert.equal(evaluateCountryGate("BR", "raffles").ok, false);
});
