const test = require("node:test");
const assert = require("node:assert/strict");
const { isIntegerMinor, toMinorFromDecimal, addMinor } = require("../money");

test("isIntegerMinor: acepta enteros >= 0", () => {
  assert.equal(isIntegerMinor(1000), true);
  assert.equal(isIntegerMinor(0), true);
});

test("isIntegerMinor: rechaza floats y negativos (cantidades enteras)", () => {
  assert.equal(isIntegerMinor(10.5), false);
  assert.equal(isIntegerMinor(-1), false);
  assert.equal(isIntegerMinor(NaN), false);
  assert.equal(isIntegerMinor("1000"), false);
});

test("toMinorFromDecimal: replica Math.round(amount*100) usado hoy en webhook.js", () => {
  assert.equal(toMinorFromDecimal(1000), 100000);
  assert.equal(toMinorFromDecimal(1000.5), 100050);
});

test("toMinorFromDecimal: rechaza montos no numéricos", () => {
  assert.throws(() => toMinorFromDecimal("abc"));
  assert.throws(() => toMinorFromDecimal(undefined));
});

test("addMinor: suma enteros, rechaza si alguno no lo es", () => {
  assert.equal(addMinor(100, 200, 300), 600);
  assert.throws(() => addMinor(100, 10.5));
});
