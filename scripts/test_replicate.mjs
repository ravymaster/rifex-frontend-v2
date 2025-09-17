// scripts/test_replicate.mjs
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import Replicate from "replicate";
import slugify from "slugify";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

// Modelos válidos en Replicate (schnell = rápido/barato, dev = más calidad)
const MODELS = [
  "black-forest-labs/flux-schnell",
  "black-forest-labs/flux-dev",
];

// Prompt 1:1 y esquina inferior derecha libre para overlay del número
function buildPrompt() {
  return `
A flat, vector-like mobile app icon, 1:1 aspect ratio with rounded corners.

Theme: "Universe". Object: "ringed planet".

Design rules:
- Dark glossy background (deep blue/green/purple/black).
- Main object with bright neon glow (yellow, cyan, green, pink).
- High contrast, crisp edges, subtle inner glow, soft shadow.
- Flat vector finish, no text/watermark.
- IMPORTANT: keep the bottom-right corner visually clean for a number overlay with CSS later.

Output: a single centered icon (no collage, no grid), consistent style.
`.trim();
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buf);
}

async function runWithModel(replicate, model) {
  const input = {
    prompt: buildPrompt(),
    aspect_ratio: "1:1",
    num_outputs: 1,
  };

  console.log(`Llamando a Replicate con: ${model} ...`);
  const output = await replicate.run(model, { input });

  const urls = Array.isArray(output) ? output : [output];
  if (!urls.length) throw new Error("No image URLs returned");

  const filename = `${slugify("universe-ringed-planet", { lower: true, strict: true })}-test.png`;
  const filepath = path.join(OUT_DIR, filename);
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await downloadFile(urls[0], filepath);
  console.log("✔ Icono guardado en:", filepath);
}

async function main() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error("Falta REPLICATE_API_TOKEN en las variables de entorno.");
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token });

  // Intenta primero 'schnell'. Si hay 404 u otro error de modelo, prueba 'dev'.
  for (const model of MODELS) {
    try {
      await runWithModel(replicate, model);
      return; // éxito, salimos
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      console.warn(`Falló con ${model}: ${msg}`);
      // Si es el último modelo, re-lanza
      if (model === MODELS[MODELS.length - 1]) throw err;
      console.log("Probando con el siguiente modelo...");
    }
  }
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
