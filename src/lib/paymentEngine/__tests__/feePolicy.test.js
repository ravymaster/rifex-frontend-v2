const test = require("node:test");
const assert = require("node:assert/strict");
const { getPlatformFeeRate, computePlatformFeeMinor } = require("../feePolicy");

const RIFEX_FEE_RATE = 0.07; // literal copiado de checkout/mp.js y checkout/colecta.js — NO importado, a propósito, para que este test sea la referencia "antes" independiente del código de producción

function legacyFee(amount) {
  const rawFee = Math.floor(amount * RIFEX_FEE_RATE);
  return Math.max(0, Math.min(rawFee, amount));
}

test("getPlatformFeeRate: CL:mercado_pago = 0.07 (el mismo RIFEX_FEE_RATE de siempre)", () => {
  assert.equal(getPlatformFeeRate("CL", "mercado_pago"), 0.07);
});

test("getPlatformFeeRate: país/provider sin policy -> null, nunca una tasa inventada", () => {
  assert.equal(getPlatformFeeRate("AR", "mercado_pago"), null);
  assert.equal(getPlatformFeeRate("CL", "stripe"), null);
});

test("computePlatformFeeMinor: paridad EXACTA con la fórmula legada, para un rango amplio de montos", () => {
  const amounts = [
    0, 1, 7, 10, 99, 100, 500, 999, 1000, 1001, 3333, 7000, 9999, 10000,
    12345, 50000, 99999, 100000, 250000, 999999, 1000000, 4999999, 10000000,
  ];
  for (const amount of amounts) {
    const before = legacyFee(amount);
    const after = computePlatformFeeMinor(amount, "CL", "mercado_pago");
    assert.equal(after, before, `divergencia en amount=${amount}: legado=${before} motor=${after}`);
  }
});

test("computePlatformFeeMinor: rechaza montos no enteros (cantidades enteras, nunca floats)", () => {
  assert.throws(() => computePlatformFeeMinor(1000.5, "CL", "mercado_pago"));
});

test("computePlatformFeeMinor: país/provider sin policy -> null (el llamador decide el fallback, nunca se inventa)", () => {
  assert.equal(computePlatformFeeMinor(1000, "AR", "mercado_pago"), null);
});
