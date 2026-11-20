// El núcleo puro (money/statusNormalizer/contracts/providerRegistry/adapter)
// no debe leer env vars ni secretos — nada de eso llega a necesitarlos: son
// transformaciones de datos que ya se le pasan. countryRouter.js/engine.js
// SÍ tocan Supabase (fuera de este check: son ESM, consumidos solo por
// Next.js, no por node --test) pero nunca imprimen ni exponen el valor de
// ningún secreto, solo lo usan para instanciar el cliente.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PURE_CORE_FILES = [
  "../money.js",
  "../statusNormalizer.js",
  "../contracts.js",
  "../providerRegistry.js",
  "../adapters/mercadoPagoAdapter.js",
  "../feePolicy.js",
].map((p) => path.join(__dirname, p));

test("núcleo puro del payment engine no referencia process.env ni secretos", () => {
  for (const file of PURE_CORE_FILES) {
    const src = fs.readFileSync(file, "utf8");
    assert.equal(src.includes("process.env"), false, `${file} no debería leer process.env`);
    assert.equal(/MP_ACCESS_TOKEN|MP_CLIENT_SECRET|SERVICE_ROLE/i.test(src), false, `${file} no debería mencionar secretos`);
  }
});
