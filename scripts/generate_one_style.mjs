// scripts/generate_one_style.mjs
// Genera UN (1) ícono por corrida, con parámetros por CLI:
//   node scripts/generate_one_style.mjs "Universe" "ringed planet" "neon magenta with cyan rim"
// Requiere: Node 18+, npm i replicate slugify

import fs from "fs";
import path from "path";
import Replicate from "replicate";
import slugify from "slugify";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const OUT_DIR = path.join(process.cwd(), "public", "icons");

// --- Parámetros por CLI ---
const THEME = process.argv[2] || "Universe";
const OBJECT = process.argv[3] || "ringed planet";
const ACCENT = process.argv[4] || "intense neon magenta with subtle cyan rim-light";

// Cambia la seed para pequeñas variaciones controladas
const SEED = Number(process.argv[5] || 77);

function buildPrompt(theme, object, accent) {
  return `
Create a SINGLE mobile-app style flat icon (not a collage, not a grid), 1:1.
Theme: ${theme}. Object: ${object}.
Style: flat/vector look, EXTREMELY sharp edges, hyper-polished glossy surfaces,
THICK ${accent} glow with strong bloom, subtle inner glow, soft shadow.
Background: clean glossy dark gradient (NO stars or particles).
Composition slightly shifted up-left to keep the bottom-right corner EMPTY
for a future CSS number overlay.
No text, no watermark, no frame, no multiple objects. Deliver exactly one icon.
`.trim();
}

const NEGATIVE_HINT =
  "stars, sparkles, dots, bokeh, noisy texture, grain, dust, watermark, logo, text, stickers, frame, collage, multiple objects, blur, low-res";

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
  return dest;
}

async function main() {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("Falta REPLICATE_API_TOKEN");
    process.exit(1);
  }

  await fs.promises.mkdir(OUT_DIR, { recursive: true });

  const MODEL = "black-forest-labs/flux-dev";
  const prompt = buildPrompt(THEME, OBJECT, ACCENT) + `\n\nAvoid: ${NEGATIVE_HINT}`;
  const input = {
    prompt,
    aspect_ratio: "1:1",
    num_outputs: 1,
    output_format: "png",
    output_quality: 100,
    prompt_upsampling: true,
    seed: SEED
  };

  console.log(`Generando: theme="${THEME}" object="${OBJECT}" accent="${ACCENT}" seed=${SEED}`);
  const out = await replicate.run(MODEL, { input });
  const urls = Array.isArray(out) ? out : [out];
  if (!urls.length) throw new Error("No image URLs returned");

  const base = `${slugify(THEME, {lower:true, strict:true})}-${slugify(OBJECT, {lower:true, strict:true})}-seed${SEED}`;
  const file = path.join(OUT_DIR, `${base}.png`);
  await download(urls[0], file);
  console.log("✔ Guardado:", file);
  console.log("\nRepite cambiando seed o accent para afinar glow/grosor/tono.");
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
