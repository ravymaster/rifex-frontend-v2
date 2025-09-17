// scripts/generate_icons_v2.mjs
// Genera 10 temáticas × 10 objetos = 100 íconos con el estilo que validaste.
// CLI opcional: --theme "Universe" (solo ese tema), --limit 3 (solo primeros 3 objetos)
// Requiere: Node 18+, npm i replicate slugify sharp

import fs from "fs";
import path from "path";
import Replicate from "replicate";
import slugify from "slugify";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

/* ===== Config ===== */
const OUT_DIR = path.join(process.cwd(), "public", "icons");
const MODEL   = "black-forest-labs/flux-dev";
const BASE_SEED = 239;           // “lock” de estilo
const OUTPUT_FORMAT = "png";
const ASPECT = "1:1";
const SLEEP_MS = 900;            // pausa entre requests
const RETRIES  = 2;              // reintentos por pieza
const MAKE_1024 = true;          // crea versión 1024 (UI)

// Acentos de color por tema (tú puedes ajustar los valores)
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

// 10 × 10
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
  Mythology: [
    "greek helmet",
    "trident",
    "thunderbolt",
    "round shield",
    "dragon head",
    "pegasus",
    "labyrinth symbol",
    "laurel wreath",
    "lyre",
    "owl of athena"
  ],
  Dinosaurs: [
    "t-rex head",
    "triceratops head",
    "velociraptor head",
    "stegosaurus plate",
    "pterodactyl silhouette",
    "raptor claw fossil",
    "dinosaur egg",
    "footprint fossil",
    "ankylosaurus tail club",
    "diplodocus head"
  ],
  "Flora & Fauna": [
    "leaf",
    "flower",
    "butterfly",
    "fish",
    "bird",
    "mushroom",
    "fox head",
    "hummingbird",
    "whale tail",
    "tree"
  ],
  Food: [
    "pizza slice",
    "burger",
    "sushi",
    "taco",
    "strawberry",
    "ice cream cone",
    "ramen bowl",
    "avocado",
    "coffee cup",
    "donut"
  ],
  "Video Games": [
    "joystick",
    "arcade machine",
    "pixel heart",
    "coin",
    "game controller",
    "8-bit star",
    "cartridge",
    "handheld console",
    "trophy",
    "gamepad d-pad"
  ],
  Superheroes: [
    "mask",
    "round shield",
    "lightning emblem",
    "cape",
    "comic speech bubble",
    "utility belt",
    "hero badge",
    "signal spotlight",
    "power gauntlet",
    "winged boots"
  ],
  Fantasy: [
    "magic wand",
    "potion bottle",
    "castle",
    "sword",
    "wizard hat",
    "crystal ball",
    "spell book",
    "dragon egg",
    "phoenix feather",
    "enchanted key"
  ],
  Technology: [
    "laptop",
    "robot head",
    "smartphone",
    "microchip",
    "satellite",
    "server rack",
    "drone",
    "vr headset",
    "battery",
    "camera lens"
  ],
  Sports: [
    "soccer ball",
    "basketball",
    "trophy",
    "boxing gloves",
    "tennis racket",
    "baseball bat",
    "american football",
    "whistle",
    "stopwatch",
    "medal"
  ]
};

function argFlag(name) {
  const ix = process.argv.findIndex(a => a === `--${name}`);
  return ix >= 0 ? process.argv[ix + 1] : null;
}
const ONLY_THEME = argFlag("theme");          // p.ej. --theme "Universe"
const LIMIT = Number(argFlag("limit") || 0);  // p.ej. --limit 3

/* ===== Prompt base (look “celular”) ===== */
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

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
  return dest;
}

async function resizeTo1024(srcPath) {
  const sharp = (await import("sharp")).default;
  const out = srcPath.replace(/\.png$/, "-1024.png");
  await sharp(srcPath).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(out);
  return out;
}

function slug(s) {
  return slugify(s, { lower: true, strict: true });
}

async function generateOne(theme, item, idx, seed) {
  const fileBase = `${slug(theme)}-${slug(item)}-${String(idx).padStart(2, "0")}`;
  const dst = path.join(OUT_DIR, `${fileBase}.png`);

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
  for (let t = 0; t <= RETRIES; t++) {
    try {
      const out = await replicate.run(MODEL, { input });
      const urls = Array.isArray(out) ? out : [out];
      if (!urls.length) throw new Error("No image URLs returned");
      await fs.promises.mkdir(OUT_DIR, { recursive: true });
      await download(urls[0], dst);

      let final = dst;
      if (MAKE_1024) final = await resizeTo1024(dst);
      return final;
    } catch (e) {
      lastErr = e;
      if (t === RETRIES) throw e;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  throw lastErr;
}

async function main() {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("Falta REPLICATE_API_TOKEN");
    process.exit(1);
  }

  console.log("Salida:", OUT_DIR);
  let total = 0;

  const entries = Object.entries(THEMES).filter(([theme]) =>
    ONLY_THEME ? theme === ONLY_THEME : true
  );

  for (const [theme, items] of entries) {
    console.log(`\n== Tema: ${theme} ==`);
    const n = LIMIT > 0 ? Math.min(LIMIT, items.length) : items.length;

    for (let i = 0; i < n; i++) {
      const seed = BASE_SEED + i; // estilo consistente, variación mínima por objeto
      const item = items[i];
      try {
        const final = await generateOne(theme, item, i + 1, seed);
        console.log("✔", path.basename(final));
        total++;
      } catch (e) {
        console.warn(`✖ Falló ${theme} / ${item}: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, SLEEP_MS));
    }
  }
  console.log(`\nListo. Generados ${total} íconos.`);
}

main().catch(err => { console.error("Error general:", err); process.exit(1); });
