const test = require("node:test");
const assert = require("node:assert/strict");
const { getMpAppConfig, isMpAppReady } = require("../mpAppConfig");

test("CL: lee MP_CLIENT_ID/MP_CLIENT_SECRET existentes, sin renombrar nada", () => {
  const prevId = process.env.MP_CLIENT_ID;
  const prevSecret = process.env.MP_CLIENT_SECRET;
  process.env.MP_CLIENT_ID = "cl-client-id-test";
  process.env.MP_CLIENT_SECRET = "cl-secret-test";
  try {
    const cfg = getMpAppConfig("CL");
    assert.equal(cfg.clientId, "cl-client-id-test");
    assert.equal(cfg.clientSecret, "cl-secret-test");
    assert.equal(isMpAppReady("CL"), true);
  } finally {
    process.env.MP_CLIENT_ID = prevId;
    process.env.MP_CLIENT_SECRET = prevSecret;
  }
});

test("AR: sin MP_CLIENT_ID_AR configurada (hoy, en todos los entornos) -> null, isMpAppReady false", () => {
  const prev = process.env.MP_CLIENT_ID_AR;
  delete process.env.MP_CLIENT_ID_AR;
  try {
    const cfg = getMpAppConfig("AR");
    assert.equal(cfg.clientId, null);
    assert.equal(isMpAppReady("AR"), false);
  } finally {
    if (prev !== undefined) process.env.MP_CLIENT_ID_AR = prev;
  }
});

test("AR: usa env vars propias (MP_CLIENT_ID_AR), nunca las de CL", () => {
  const prevCl = process.env.MP_CLIENT_ID;
  const prevAr = process.env.MP_CLIENT_ID_AR;
  process.env.MP_CLIENT_ID = "cl-client-id-should-not-leak";
  process.env.MP_CLIENT_ID_AR = "ar-client-id-test";
  try {
    const cfg = getMpAppConfig("AR");
    assert.equal(cfg.clientId, "ar-client-id-test");
    assert.notEqual(cfg.clientId, process.env.MP_CLIENT_ID);
  } finally {
    process.env.MP_CLIENT_ID = prevCl;
    process.env.MP_CLIENT_ID_AR = prevAr;
  }
});

test("país sin app de MP prevista -> null (no CL ni AR)", () => {
  assert.equal(getMpAppConfig("BR"), null);
  assert.equal(isMpAppReady("BR"), false);
});
