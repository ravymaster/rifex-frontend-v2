// AR1 (histórico) / ajuste 2026-08-29: prueba el fail-safe de
// isCountryActive/evaluateCountryGate hacia producción. environmentPolicy.js
// lee NEXT_PUBLIC_STAGE UNA sola vez al cargar el módulo (const de nivel de
// módulo) — por eso este archivo se corre en un proceso `node --test`
// APARTE, con NEXT_PUBLIC_STAGE=development seteado ANTES de arrancar node
// (ver comando en el informe). No se puede mezclar con capability.test.mjs
// (que corre sin la variable) en el mismo proceso sin ese cuidado.
//
// Corrección 2026-08-29 — Country Gate: Argentina quedó explícitamente
// fuera de operación (devOnly:false en countryPolicy.js), incluso en DEV.
// No es una reactivación del trabajo internacional — es lo opuesto. Este
// archivo ahora certifica que AR se comporta exactamente como cualquier
// país deshabilitado sin devOnly (mismo criterio que el test de BR más
// abajo), pese a correr con NEXT_PUBLIC_STAGE=development. El mecanismo
// devOnly en sí (el campo, el chequeo en isCountryActive) se conserva sin
// tocar — solo el valor de AR cambió — así que este archivo sigue siendo
// el lugar correcto para volver a probarlo si se reactiva más adelante.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCountryGate, isCountryActive } from "../../countryPolicy.js";

test("precondición: este archivo corre con NEXT_PUBLIC_STAGE=development", () => {
  assert.equal(process.env.NEXT_PUBLIC_STAGE, "development");
});

test("Country Gate 2026-08-29: AR NO se activa en DEV (Argentina fuera de operación, devOnly:false)", () => {
  assert.equal(isCountryActive("AR"), false);
});

test("Country Gate 2026-08-29: CL sigue activo en DEV, sin cambios", () => {
  assert.equal(isCountryActive("CL"), true);
});

test("Country Gate 2026-08-29: evaluateCountryGate('AR', *) -> country_not_available en DEV, ninguna capability pasa", () => {
  for (const capability of ["raffles", "fundraising", "mercadoPago", "events"]) {
    const r = evaluateCountryGate("AR", capability);
    assert.equal(r.ok, false, `AR/${capability} debería estar bloqueado`);
    assert.equal(r.reason, "country_not_available");
  }
});

test("Country Gate 2026-08-29: evaluateCountryGate('CL', *) sigue funcionando exactamente igual", () => {
  assert.equal(evaluateCountryGate("CL", "raffles").ok, true);
  assert.equal(evaluateCountryGate("CL", "fundraising").ok, true);
  assert.equal(evaluateCountryGate("CL", "mercadoPago").ok, true);
  assert.equal(evaluateCountryGate("CL", "events").ok, true);
});

test("países sin devOnly siguen inactivos en DEV (BR no se habilitó por accidente) — AR ahora se comporta igual", () => {
  assert.equal(isCountryActive("BR"), false);
  assert.equal(evaluateCountryGate("BR", "raffles").ok, false);
});
