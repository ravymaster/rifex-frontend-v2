// DIFUSIÓN V1 — certificación específica de /difusion (docs/difusion/DIFUSION_V1.md).
// Cubre exactamente los invariantes exigidos por la misión que introdujo
// PSCG + Difusión V1. Complementa (no duplica) tests/pscg.test.mjs, que
// certifica el registro de clasificación en general.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const src = read("src/pages/difusion.jsx");
const layoutSrc = read("src/components/Layout.jsx");
const sitemap = read("public/sitemap.xml");
const robots = read("public/robots.txt");

// ---------- auth boundary: anónimo 307, next correcto ----------
test("difusion.jsx: getServerSideProps real, redirige a /login?next=/difusion si no hay sesión", () => {
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /getSupabaseServer/);
  assert.match(src, /s\.auth\.getUser\(\)/);
  assert.match(src, /redirect:\s*\{\s*destination:\s*'\/login\?next=\/difusion'/);
});

test("difusion.jsx: no depende únicamente de un useEffect — el redirect vive en getServerSideProps, no en un hook client-side", () => {
  // La única lógica de "si no hay usuario" del archivo debe estar dentro
  // de getServerSideProps; el componente no debe tener su propio
  // useEffect de verificación de sesión (ese patrón es el que PSCG marca
  // como boundary más débil para páginas nuevas).
  assert.doesNotMatch(src, /useEffect/);
});

// ---------- metadata: noindex, nofollow, noarchive ----------
test("difusion.jsx: pasa noindex y noarchive a Layout — title/description exactos de la misión", () => {
  assert.match(src, /title="Difusión — Rifex"/);
  assert.match(
    src,
    /description="Guía para compartir tus iniciativas de Rifex en redes sociales de forma clara y responsable\."/
  );
  assert.match(src, /noindex/);
  assert.match(src, /noarchive/);
});

test("Layout.jsx: el prop noarchive agrega noarchive al robots meta solo cuando noindex está activo, compatible hacia atrás", () => {
  assert.match(layoutSrc, /noarchive = false/);
  assert.match(layoutSrc, /noindex, nofollow\$\{noarchive \? ', noarchive' : ''\}/);
});

// ---------- fuera de sitemap ----------
test("difusion.jsx: /difusion está fuera de sitemap.xml", () => {
  assert.doesNotMatch(sitemap, /<loc>https:\/\/rifex\.pro\/difusion<\/loc>/);
});

// ---------- robots.txt Disallow ----------
test("robots.txt: Disallow: /difusion presente, mismo patrón que el resto de rutas PRIVATE_AUTHENTICATED con boundary ssr_redirect/ssr_gate_redirect", () => {
  assert.match(robots, /Disallow: \/difusion/);
});

// ---------- fuera de navbar pública / footer, presente en menú autenticado ----------
test("Layout.jsx: 'Difusión' NO está en navItems (navbar pública) ni en el footer público", () => {
  const navItemsBlock = layoutSrc.match(/const navItems = \[[\s\S]*?\];/)[0];
  assert.doesNotMatch(navItemsBlock, /Difusión/);
  const footerBlock = layoutSrc.match(/<footer[\s\S]*?<\/footer>/)[0];
  assert.doesNotMatch(footerBlock, /Difusión/);
});

test("Layout.jsx: 'Difusión' SÍ está en accountItems (menú de cuenta autenticado), entre Mis iniciativas y Bancos & Pagos", () => {
  const accountItemsBlock = layoutSrc.match(/const accountItems = \[[\s\S]*?\];/)[0];
  assert.match(accountItemsBlock, /label:\s*'Difusión',\s*href:\s*'\/difusion'/);
  const misIdx = accountItemsBlock.indexOf("Mis iniciativas");
  const difusionIdx = accountItemsBlock.indexOf("Difusión");
  const bancosIdx = accountItemsBlock.indexOf("Bancos & Pagos");
  assert.ok(misIdx < difusionIdx && difusionIdx < bancosIdx, "el orden del menú debe ser Mis iniciativas, Difusión, Bancos & Pagos");
});

// ---------- contenido educativo, ejemplo, botón copiar ----------
test("difusion.jsx: contiene el bloque 'Qué debes saber' con el texto exacto de la misión", () => {
  assert.match(src, /Qué debes saber/);
  assert.match(src, /pueden aplicar restricciones a publicaciones y anuncios relacionados con rifas/);
  assert.doesNotMatch(src, /siempre (serán?|será) (sancionad|eliminad|rechazad)/i);
});

test("difusion.jsx: contiene las 7 recomendaciones de 'Antes de publicar'", () => {
  assert.match(src, /Antes de publicar/);
  for (const rec of [
    "Describe con claridad",
    "Identifica al organizador",
    "información verdadera y verificable",
    "Evita promesas de ganancias",
    "Evita mensajes engañosos",
    "enlace oficial de tu iniciativa",
    "políticas de la red",
  ]) {
    assert.match(src, new RegExp(rec));
  }
});

test("difusion.jsx: sección 'Palabras sensibles' no enseña bypass/evasión/cloaking", () => {
  assert.match(src, /Palabras sensibles/);
  assert.match(src, /pueden activar revisiones adicionales/);
  for (const forbidden of ["bypass", "evasi[oó]n", "enga[ñn]ar al algoritmo", "cloaking", "sustituci[oó]n deliberada"]) {
    assert.doesNotMatch(src, new RegExp(forbidden, "i"));
  }
});

test("difusion.jsx: ejemplo copiable presente con placeholders y botón 'Copiar ejemplo' vía clipboard local, sin API", () => {
  assert.match(src, /Ejemplo de publicación/);
  assert.match(src, /\[motivo o causa\]/);
  assert.match(src, /\[enlace de tu iniciativa\]/);
  assert.match(src, /\[nombre del organizador\]/);
  assert.match(src, /Copiar ejemplo/);
  assert.match(src, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(src, /fetch\(['"`]\/api\//);
});

test("difusion.jsx: sección 'Publicidad pagada' presente, sin inventar enlaces externos", () => {
  assert.match(src, /Publicidad pagada/);
  assert.match(src, /Meta, TikTok y otras plataformas/);
  assert.doesNotMatch(src, /https?:\/\/(?!rifex\.pro)/);
});

// ---------- V1 explícitamente limitada: cero IA, cero API social, cero Payment/Trust/comisión ----------
test("difusion.jsx: cero IA, cero Warp AI, cero APIs sociales, cero Payment Engine, cero Trust backend, cero comisión", () => {
  const forbidden = [
    "openai",
    "warp",
    "gpt",
    "oauth",
    "meta.*graph.*api",
    "tiktok.*api",
    "marketplace_fee",
    "RIFEX_FEE_RATE",
    "assertCreatorEligible",
    "webhook",
    "payment",
  ];
  for (const term of forbidden) {
    assert.doesNotMatch(src.toLowerCase(), new RegExp(term.toLowerCase()));
  }
});
