const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveFallbackDecision } = require("../fallbackPolicy");

test("motor resolvió ok -> use_engine", () => {
  assert.equal(resolveFallbackDecision({ ok: true, country: "AR" }), "use_engine");
});

test("falla y país es CL -> fallback_cl (preserva P2 exacto)", () => {
  assert.equal(resolveFallbackDecision({ ok: false, country: "CL", reason: "adapter_not_found" }), "fallback_cl");
});

test("falla y país es null/undefined (legado) -> fallback_cl", () => {
  assert.equal(resolveFallbackDecision({ ok: false, country: null, reason: "needs_onboarding" }), "fallback_cl");
  assert.equal(resolveFallbackDecision({ ok: false, reason: "engine_error" }), "fallback_cl");
});

test("AR2 FAIL CLOSED: falla y país es AR (o cualquier no-CL) -> fail_closed, NUNCA fallback", () => {
  assert.equal(resolveFallbackDecision({ ok: false, country: "AR", reason: "adapter_not_found" }), "fail_closed");
  assert.equal(resolveFallbackDecision({ ok: false, country: "BR", reason: "country_not_available" }), "fail_closed");
});
