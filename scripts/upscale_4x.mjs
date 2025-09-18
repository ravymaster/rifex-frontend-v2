// scripts/upscale_4x.mjs
// Upscale 2x/4x un PNG existente.
// Uso: node scripts/upscale_4x.mjs "public/icons/archivo.png" 4
//
// Intenta upscalers de Replicate y, si todos fallan (404, etc.),
// hace fallback local con Sharp (Lanczos3).

import fs from "fs";
import path from "path";
import Replicate from "replicate";

const inPath = process.argv[2];
const SCALE  = Number(process.argv[3] || 4);

if (!inPath) {
  console.error('Uso: node scripts/upscale_4x.mjs "<ruta/archivo.png>" [scale=4]');
  process.exit(1);
}

async function fetchToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function tryReplicateUpscalers(buf, scale) {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const MODELS = [
    // intenta en este orden; si uno no existe en tu cuenta/plan, prueba el siguiente
    "google/upscaler",        // scale: 2 o 4
    "xinntao/realesrgan",     // Real-ESRGAN
    "nightmareai/real-esrgan" // otra variante de ESRGAN
  ];

  let lastErr;
  for (const model of MODELS) {
    try {
      const input =
        model === "google/upscaler"
          ? { image: buf, scale }
          : { image: buf, scale, face_enhance: false };

      const out = await replicate.run(model, { input });
      const urls = Array.isArray(out) ? out : [out];
      if (!urls.length) throw new Error("No upscaled image returned");
      return await fetchToBuffer(urls[0]);
    } catch (e) {
      lastErr = e;
      console.warn(`Upscale falló con ${model}: ${e.message}`);
    }
  }
  throw lastErr;
}

async function fallbackSharp(srcPath, scale) {
  const sharp = (await import("sharp")).default;
  const img = sharp(srcPath);
  const meta = await img.metadata();
  const width  = Math.round((meta.width  || 1024) * scale);
  const height = Math.round((meta.height || 1024) * scale);
  return await img
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const ext = path.extname(inPath);
  const base = inPath.replace(ext, "");
  const outPath = `${base}-${SCALE}x.png`;

  const srcBuf = await fs.promises.readFile(inPath);

  let outBuf;
  try {
    if (!process.env.REPLICATE_API_TOKEN) throw new Error("Falta REPLICATE_API_TOKEN");
    console.log("Intentando upscalers de Replicate…");
    outBuf = await tryReplicateUpscalers(srcBuf, SCALE);
  } catch (e) {
    console.warn("No se pudo usar Replicate. Fallback local con Sharp:", e.message);
    outBuf = await fallbackSharp(inPath, SCALE);
  }

  await fs.promises.writeFile(outPath, outBuf);
  console.log("✔ Upscaled guardado en:", outPath);
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
