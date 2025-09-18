// node scripts/mp_bin_probe.mjs 450995      // Visa test
// node scripts/mp_bin_probe.mjs 503175      // Master test
import fs from "fs";

function readFromEnvFile(name) {
  try {
    const txt = fs.readFileSync(".env.local", "utf8");
    const m = txt.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1") : null;
  } catch { return null; }
}

const PK = process.env.MP_PUBLIC_KEY || readFromEnvFile("MP_PUBLIC_KEY");
if (!PK) { console.error("Falta MP_PUBLIC_KEY (ponla en .env.local)"); process.exit(1); }

const bin = process.argv[2] || "450995";
const url = `https://api.mercadopago.com/v1/payment_methods/search?public_key=${PK}&bin=${bin}`;

const r = await fetch(url);
if (!r.ok) { console.error("Error:", r.status, await r.text()); process.exit(1); }

const data = await r.json();
const list = (data.results || [])
  .filter(x => x.payment_type_id === "credit_card")
  .map(x => ({ id: x.id, name: x.name, status: x.status }));

if (!list.length) {
  console.log("NO-CARDS: no hay métodos de tarjeta para este BIN/public_key.");
} else {
  console.log("Tarjetas encontradas:");
  for (const it of list) console.log(`- ${it.id}\t${it.name}\t${it.status}`);
}
