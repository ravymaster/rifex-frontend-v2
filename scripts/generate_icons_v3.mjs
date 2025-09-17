// scripts/generate_icons_v3.mjs
// Guarda en /public/icons/<tema>/<archivo>.png y crea /public/icons/manifest.json
// Requiere: Node 18+, npm i replicate slugify sharp

import fs from "fs";
import path from "path";
import Replicate from "replicate";
import slugify from "slugify";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

/* ===== Config ===== */
const OUT_ROOT = path.join(process.cwd(), "public", "icons");
const MODEL = "black-forest-labs/flux-dev";
const BASE_SEED = 239;      // estilo “lock”
const OUTPUT_FORMAT = "png";
const ASPECT = "1:1";
const SLEEP_MS = 900;
const RETRIES = 2;
const MAKE_1024 = true;     // si no tienes sharp, el script lo ignora con aviso

// CLI: --theme "Universe" --limit 3
function argFlag(name) {
  const i = process.argv.findIndex(a => a === `--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}
const ONLY_THEME = argFlag("theme");
const LIMIT = Number(argFlag("limit") || 0);

/* ===== Datos (10 x 10) ===== */
const THEME_ACCENTS = {
  "Universe": "pure neon #FF2FB7 with cyan #00F0FF rim; very strong bloom",
  "Mythology": "neon gold with subtle hot pink rim; strong bloom",
  "Dinosaurs": "intense neon green / lime; strong bloom",
  "Flora & Fauna": "neon emerald / aqua; strong bloom",
  "Food": "neon orange / strawberry pink; strong bloom",
  "Video Games": "neon cyan / electric blue; strong bloom",
  "Superheroes": "neon yellow with hot pink rim; strong bloom",
  "Fantasy": "neon violet / amethyst; strong bloom",
  "Technology": "neon cyan / teal; strong bloom",
  "Sports": "neon gold with cyan details; strong bloom",
};

const THEMES = {
  Universe: [
    "ringed planet with EXTRA thick luminous neon ring; background perfectly clean (no stars)",
    "neon rocket with EXTRA thick luminous neon contours; background perfectly clean (no stars)",
    "solar eclipse ring; background perfectly clean (no stars)",
    "black hole rim; background perfectly clean (no stars)",
    "spiral galaxy; background perfectly clean (no stars)",
    "shooting star trail; background perfectly clean (no stars)",
    "crescent moon; background perfectly clean (no stars)",
    "sun disk; background perfectly clean (no stars)",
    "astronaut helmet; background perfectly clean (no stars)",
    "telescope; background perfectly clean (no stars)"
  ],
  Mythology: ["greek helmet","trident","thunderbolt","round shield","dragon head","pegasus","labyrinth symbol","laurel wreath","lyre","owl of athena"],
  Dinosaurs: ["t-rex head","triceratops head","velociraptor head","stegosaurus plate","pterodactyl silhouette","raptor claw fossil","dinosaur egg","footprint fossil","ankylosaurus tail club","diplodocus head"],
  "Flora & Fauna": ["leaf","flower","butterfly","fish","bird","mushroom","fox head","hummingbird","whale tail","tree"],
  Food: ["pizza slice","burger","sushi","taco","strawberry","ice cream cone","ramen bowl","avocado","coffee cup","donut"],
  "Video Games": ["joystick","arcade machine","pixel heart","coin","game controller","8-bit star","cartridge","handheld console","trophy","gamepad d-pad"],
  Superheroes: ["mask","round shield","lightning emblem","cape","comic speech bubble","utility belt","hero badge","signal spotlight","power gauntlet","winged boots"],
  Fantasy: ["magic wand","potion bottle","castle","sword","wizard hat","crystal ball","spell book","dragon egg","phoenix feather","enchanted key"],
  Technology: ["laptop","robot head","smartphone","microchip","satellite","server rack","drone","vr headset","battery","camera lens"],
  Sports: ["soccer ball","basketball","trophy","boxing gloves","tennis racket","baseball bat","american football","whistle","stopwatch","medal"],
};

/* ===== Prompt estilo “celular” ===== */
function buildPrompt(theme, item) {
  const accent = THEME_ACCENTS[theme] || "intense neon glow";
  return `
Create a SINGLE mobile-app style flat icon (not a collage, not a grid), 1:1.
Theme: ${theme}. Object: ${item}.
Style: flat/vector look, EXTREMELY sharp edges, hyper-polished glossy surfaces,
THICK ${accent}, with strong bloom; subtle inner glow; soft shadow for depth.
Background: clean glossy dark gradient (ABSOLUTELY no stars or particles).
Composition slightly shifted up-left to keep the bottom-right corner EMPTY
for a future CSS number overlay. One object only. No text. No watermark. No frame.
`.trim();
}
const NEGATIVE_HINT =
  "stars, sparkles, dots, bokeh, noise, grain, dust, watermark, logo, text, stickers, frame, collage, multiple objects, blur, low-res";

function slug(s){ return slugify(s, { lower:true, strict:true }); }

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
  return dest;
}

async function resizeTo1024(srcPath) {
  try {
    const sharp = (await import("sharp")).default;
    const out = srcPath.replace(/\.png$/, "-1024.png");
    await sharp(srcPath).resize(1024,1024).png({ compressionLevel:9 }).toFile(out);
    return out;
  } catch {
    console.warn("⚠️  sharp no está instalado; se omite versión 1024.");
    return null;
  }
}

async function generateOne(theme, item, idx, seed, manifest) {
  const themeSlug = slug(theme);
  const itemSlug  = slug(item);
  const themeDir  = path.join(OUT_ROOT, themeSlug);
  await fs.promises.mkdir(themeDir, { recursive:true });

  const fileBase = `${String(idx).padStart(2,"0")}-${itemSlug}`;
  const dst512   = path.join(themeDir, `${fileBase}.png`);

  const input = {
    prompt: buildPrompt(theme, item) + `\n\nAvoid: ${NEGATIVE_HINT}`,
    aspect_ratio: ASPECT,
    num_outputs: 1,
    output_format: OUTPUT_FORMAT,
    output_quality: 100,
    prompt_upsampling: true,
    seed
  };

  let lastErr;
  for (let t=0; t<=RETRIES; t++){
    try {
      const out = await replicate.run(MODEL, { input });
      const urls = Array.isArray(out) ? out : [out];
      if (!urls.length) throw new Error("No image URLs returned");
      await download(urls[0], dst512);

      let dst1024 = null;
      if (MAKE_1024) dst1024 = await resizeTo1024(dst512);

      // Rutas públicas (desde /public)
      const pub512  = `/icons/${themeSlug}/${path.basename(dst512)}`;
      const pub1024 = dst1024 ? `/icons/${themeSlug}/${path.basename(dst1024)}` : null;

      // agrega al manifest
      manifest.themes[themeSlug] ??= { title: theme, items: [] };
      manifest.themes[themeSlug].items.push({
        idx, name: item, file512: pub512, file1024: pub1024
      });

      return;
    } catch(e){
      lastErr = e;
      if (t === RETRIES) throw e;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  throw lastErr;
}

async function main(){
  if (!process.env.REPLICATE_API_TOKEN){
    console.error("Falta REPLICATE_API_TOKEN");
    process.exit(1);
  }
  await fs.promises.mkdir(OUT_ROOT, { recursive:true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    seedBase: BASE_SEED,
    themes: {}  // { universe: { title: "Universe", items: [{idx,name,file512,file1024}] } }
  };

  const entries = Object.entries(THEMES).filter(([theme]) =>
    ONLY_THEME ? theme === ONLY_THEME : true
  );

  let total = 0;
  for (const [theme, items] of entries){
    console.log(`\n== Tema: ${theme} ==`);
    const n = LIMIT > 0 ? Math.min(LIMIT, items.length) : items.length;
    for (let i=0; i<n; i++){
      const seed = BASE_SEED + i; // variación mínima por objeto
      await generateOne(theme, items[i], i+1, seed, manifest);
      console.log("✔", theme, "-", items[i]);
      total++;
      await new Promise(r => setTimeout(r, SLEEP_MS));
    }
  }

  const manifestPath = path.join(OUT_ROOT, "manifest.json");
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`\nListo. Generados ${total} íconos.`);
  console.log("Manifest:", `/icons/manifest.json`);
}

main().catch(err => { console.error("Error general:", err); process.exit(1); });
