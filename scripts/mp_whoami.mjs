// Node 18+ (fetch nativo). Sin dependencias externas.
import fs from "fs";

function readTokenFromEnvFile() {
  try {
    const txt = fs.readFileSync(".env.local", "utf8");
    const m = txt.match(/^MP_ACCESS_TOKEN\s*=\s*(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

let TOKEN = process.env.MP_ACCESS_TOKEN || readTokenFromEnvFile();

if (!TOKEN) {
  console.error("Falta MP_ACCESS_TOKEN. Define la var de entorno o agrega MP_ACCESS_TOKEN=TEST-... en .env.local");
  process.exit(1);
}

const r = await fetch("https://api.mercadopago.com/users/me", {
  headers: { Authorization: `Bearer ${TOKEN}` }
});

if (!r.ok) {
  console.error("Error consultando /users/me:", r.status, await r.text());
  process.exit(1);
}

const j = await r.json();
console.log({
  live_mode: j.live_mode,   // false si token TEST
  id: j.id,
  nickname: j.nickname,
  site_id: j.site_id,       // Debe ser "MLC" (Chile)
  email: j.email
});
