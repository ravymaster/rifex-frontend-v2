// RIFEX PRODUCT LANDINGS V1 — certifica las 3 landings públicas nuevas/
// evolucionadas (Eventos, Campañas, Inscripciones) y la landing privada
// de Rifas: clasificación PSCG, presencia en sitemap/robots, metadata,
// JSON-LD, ausencia de Plus/Gold, navegación pública/autenticada, y
// ausencia estructural de cualquier rama de código condicionada por
// User-Agent (no-cloaking). Las pruebas "200 anónimo"/"redirect real
// multi-UA" en vivo se ejecutan aparte contra un servidor real (mismo
// patrón que authUxCrawler/publicSurfaceFinalCleanup) — este archivo
// certifica lo que es verificable de forma estática y determinista.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PSCG_CATEGORY,
  PSCG_BOUNDARY,
  findPscgEntry,
} from "../src/lib/publicSurfaceClassification.js";
import { buildServiceJsonLd, buildFaqJsonLd } from "../src/lib/productJsonLd.js";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const sitemap = read("public/sitemap.xml");
const robots = read("public/robots.txt");

// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) superó /soluciones/eventos
// como landing independiente: /eventos ahora ES la landing consolidada
// (Product Landings V1 content + catálogo real), y /soluciones/eventos
// quedó como redirect permanente (LEGACY_REMOVED, cubierto por
// tests/pscg.test.mjs de forma genérica). Se actualiza esta lista para
// apuntar a la ruta y archivo reales.
const PUBLIC_LANDINGS = [
  { path: "/eventos", file: "src/pages/eventos/index.jsx" },
  { path: "/campanas", file: "src/pages/campanas.jsx" },
  { path: "/inscripciones", file: "src/pages/inscripciones.jsx" },
];

// ---------- 1-3. Las 3 públicas: PSCG PUBLIC_INDEXABLE, sin auth boundary (equivale a 200 anónimo) ----------
for (const { path: p, file } of PUBLIC_LANDINGS) {
  test(`${p}: clasificada PUBLIC_INDEXABLE en PSCG_REGISTRY`, () => {
    const entry = findPscgEntry(p);
    assert.ok(entry, `${p} debe existir en PSCG_REGISTRY`);
    assert.equal(entry.category, PSCG_CATEGORY.PUBLIC_INDEXABLE);
  });

  test(`${p}: sin getServerSideProps de auth — equivale a 200 real para anónimo`, () => {
    const src = read(file);
    assert.doesNotMatch(src, /getServerSideProps/, `${p} no debe requerir sesión`);
  });
}

// ---------- 4-5. Rifas privada: redirect SSR real, cero HTML privado antes del redirect ----------
test("/soluciones/rifas: clasificada PRIVATE_AUTHENTICATED con boundary ssr_redirect", () => {
  const entry = findPscgEntry("/soluciones/rifas");
  assert.ok(entry, "/soluciones/rifas debe existir en PSCG_REGISTRY");
  assert.equal(entry.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
  assert.equal(entry.boundary, PSCG_BOUNDARY.SSR_REDIRECT);
});

test("/soluciones/rifas: getServerSideProps redirige ANTES de cualquier render — destino literal fijo, nunca ctx.query", () => {
  const src = read("src/pages/soluciones/rifas.jsx");
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /getSupabaseServer/);
  assert.match(src, /s\.auth\.getUser\(\)/);
  assert.match(src, /redirect:\s*\{\s*destination:\s*['"`]\/login\?next=\/soluciones\/rifas['"`]/);
  // El propio encabezado del archivo documenta EN COMENTARIO que "nunca
  // ctx.query" se usa — hay que excluir comentarios o ese texto mismo
  // haría fallar la aserción (mismo falso positivo ya visto en este
  // repo). Se revisa solo el cuerpo real de getServerSideProps.
  const body = src.split(/export async function getServerSideProps/)[1] || "";
  assert.doesNotMatch(body, /ctx\.query/, "el destino del redirect nunca debe leer ctx.query (superficie de open-redirect)");
});

// ---------- 6-7. PSCG explícito para las 2 rutas realmente nuevas ----------
test("/campanas es una ruta nueva de esta misión (no existía antes) y quedó clasificada", () => {
  assert.ok(exists("src/pages/campanas.jsx"));
  assert.ok(findPscgEntry("/campanas"));
});

test("/soluciones/eventos y /soluciones/rifas son rutas nuevas de esta misión y quedaron clasificadas", () => {
  assert.ok(exists("src/pages/soluciones/eventos.jsx"));
  assert.ok(exists("src/pages/soluciones/rifas.jsx"));
  assert.ok(findPscgEntry("/soluciones/eventos"));
  assert.ok(findPscgEntry("/soluciones/rifas"));
});

// ---------- 8-9. sitemap ----------
test("sitemap.xml contiene las 3 landings públicas", () => {
  for (const { path: p } of PUBLIC_LANDINGS) {
    assert.match(sitemap, new RegExp(`<loc>https://rifex\\.pro${p}</loc>`), `${p} debe estar en sitemap.xml`);
  }
});

test("sitemap.xml NO contiene /soluciones/rifas (privada)", () => {
  assert.doesNotMatch(sitemap, /<loc>https:\/\/rifex\.pro\/soluciones\/rifas<\/loc>/);
});

test("robots.txt bloquea /soluciones/rifas y no bloquea ninguna de las 3 públicas", () => {
  assert.match(robots, /Disallow:\s*\/soluciones\/rifas/);
  for (const { path: p } of PUBLIC_LANDINGS) {
    assert.doesNotMatch(robots, new RegExp(`Disallow:\\s*${p.replace(/\//g, "\\/")}\\b`));
  }
});

// ---------- 10-11. Metadata + canonical ----------
for (const { path: p, file } of PUBLIC_LANDINGS) {
  test(`${p}: declara title/description/canonicalPath propios coincidentes con su ruta real`, () => {
    const src = read(file);
    assert.match(src, /title=/);
    assert.match(src, /description=/);
    assert.match(src, new RegExp(`canonicalPath=["'\`]${p.replace(/\//g, "\\/")}["'\`]`));
  });
}

test("/soluciones/rifas: noindex+noarchive explícitos (nunca promocionada)", () => {
  const src = read("src/pages/soluciones/rifas.jsx");
  assert.match(src, /noindex/);
  assert.match(src, /noarchive/);
});

// ---------- 12. Un solo H1 por landing (ProductHero es el único lugar que renderiza <h1>) ----------
test("ProductSections.jsx: solo ProductHero renderiza un <h1>, ningún otro export lo hace", () => {
  const src = read("src/components/product/ProductSections.jsx");
  const h1Count = (src.match(/<h1/g) || []).length;
  assert.equal(h1Count, 1, "debe existir exactamente un <h1> en todo el módulo de secciones compartidas");
});

for (const { path: p, file } of [...PUBLIC_LANDINGS, { path: "/soluciones/rifas", file: "src/pages/soluciones/rifas.jsx" }]) {
  test(`${p}: usa <ProductHero> exactamente una vez (un solo H1 real por página)`, () => {
    const src = read(file);
    const count = (src.match(/<ProductHero\b/g) || []).length;
    assert.equal(count, 1, `${p} debe renderizar ProductHero exactamente una vez`);
  });
}

// ---------- 13. JSON-LD válido y coherente ----------
test("buildServiceJsonLd produce un objeto Service válido y serializable", () => {
  const ld = buildServiceJsonLd({ name: "X", description: "Y", url: "https://rifex.pro/x" });
  const parsed = JSON.parse(JSON.stringify(ld));
  assert.equal(parsed["@type"], "Service");
  assert.equal(parsed.provider["@type"], "Organization");
  assert.equal(parsed.provider.name, "Rifex");
});

test("buildFaqJsonLd produce un FAQPage cuyas preguntas coinciden exactamente con las de entrada", () => {
  const items = [{ q: "¿Uno?", a: "Sí." }, { q: "¿Dos?", a: "También." }];
  const ld = buildFaqJsonLd(items);
  const parsed = JSON.parse(JSON.stringify(ld));
  assert.equal(parsed["@type"], "FAQPage");
  assert.equal(parsed.mainEntity.length, 2);
  assert.equal(parsed.mainEntity[0].name, "¿Uno?");
  assert.equal(parsed.mainEntity[0].acceptedAnswer.text, "Sí.");
});

for (const { path: p, file } of PUBLIC_LANDINGS) {
  test(`${p}: renderiza JSON-LD Service + FAQPage con contenido realmente presente en la página (FAQ visible en HTML)`, () => {
    const src = read(file);
    assert.match(src, /buildServiceJsonLd/);
    assert.match(src, /buildFaqJsonLd/);
    assert.match(src, /application\/ld\+json/);
    assert.match(src, /<ProductFaq\b/, `${p} debe renderizar el bloque FAQ visible en HTML, no solo el JSON-LD`);
  });
}

test("/soluciones/rifas: sin JSON-LD comercial público (PRIVATE_AUTHENTICATED nunca lleva structured data pública)", () => {
  const src = read("src/pages/soluciones/rifas.jsx");
  assert.doesNotMatch(src, /application\/ld\+json/);
  assert.doesNotMatch(src, /buildServiceJsonLd|buildFaqJsonLd/);
});

// ---------- 14-15. Footer ----------
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) superó estas 3
// aserciones: /soluciones/eventos quedó como redirect permanente hacia
// /eventos (que ahora ES la landing consolidada), así que el footer
// apunta directo a /eventos; y Rifas se movió del menú de cuenta
// superior al footer autenticado. Se actualizan para reflejar el estado
// real e intencional, no el histórico.
test("footer público: enlaza las landings públicas bajo 'Soluciones' (Eventos -> /eventos, consolidado)", () => {
  const src = read("src/components/Layout.jsx");
  assert.match(src, />Soluciones</);
  assert.match(src, /href="\/eventos"/);
  assert.match(src, /href="\/campanas"/);
  assert.match(src, /href="\/inscripciones"/);
});

test("footer público: 'Cómo funcionan las Rifas' solo se renderiza cuando hay sesión (user truthy)", () => {
  const src = read("src/components/Layout.jsx");
  const footerBlock = src.match(/<footer[\s\S]*?<\/footer>/);
  assert.ok(footerBlock, "no se encontró el bloque <footer>");
  assert.match(footerBlock[0], /\{user\s*&&\s*<Link href="\/soluciones\/rifas">/);
});

// ---------- 16. Rifas se retiró del menú de cuenta superior ----------
test("accountItems (menú de cuenta autenticado): YA NO incluye 'Rifas' (movida al footer autenticado)", () => {
  const src = read("src/components/Layout.jsx");
  const match = src.match(/const accountItems = \[[\s\S]*?\];/);
  assert.ok(match, "no se encontró el bloque accountItems");
  assert.doesNotMatch(match[0], /label:\s*'Rifas'/);
});

// ---------- 17-18. Wizard ----------
test("wizard.js: ofrece los 3 flujos públicos (Eventos/Campañas/Inscripciones) con CTAs a rutas reales", () => {
  const src = read("src/pages/wizard.js");
  assert.match(src, /Quiero crear un evento/);
  assert.match(src, /Quiero crear una campaña/);
  assert.match(src, /Quiero recibir inscripciones/);
  assert.match(src, /href="\/crear-inscripcion"/);
});

// Excluye comentarios de código: el propio encabezado del archivo
// documenta en prosa que Rifas existe como producto autenticado y que
// NO se agrega acá — esa es la razón de la decisión, no contenido
// renderizado. Mismo criterio que authUxCrawler.test.mjs usa para este
// mismo archivo.
test("wizard.js: contenido renderizado nunca expone un modo/flujo de Rifas en la superficie pública", () => {
  const src = read("src/pages/wizard.js");
  const rendered = src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(rendered, /modo === 'rifa'/);
  assert.doesNotMatch(rendered, /\brifas?\b/i);
});

// ---------- 19. Sin 404s públicos nuevos: cada CTA apunta a un archivo real existente ----------
test("todas las rutas destino de los CTA de las 4 landings corresponden a páginas reales existentes", () => {
  const realTargets = ["src/pages/crear-evento.jsx", "src/pages/crear-colecta.jsx", "src/pages/crear-inscripcion.jsx", "src/pages/crear-rifa.jsx", "src/pages/eventos/index.jsx", "src/pages/difusion.jsx"];
  for (const f of realTargets) assert.ok(exists(f), `${f} debe existir — es el destino real de un CTA de una landing nueva`);
});

// ---------- 20-22. Estructura anti-cloaking: ninguna landing nueva condiciona su HTML por User-Agent ----------
for (const { path: p, file } of [...PUBLIC_LANDINGS, { path: "/soluciones/rifas", file: "src/pages/soluciones/rifas.jsx" }]) {
  test(`${p}: sin ninguna rama de código condicionada por User-Agent (estructuralmente imposible de cloakear)`, () => {
    const src = read(file);
    assert.doesNotMatch(src, /user-agent/i);
    assert.doesNotMatch(src, /Googlebot|facebookexternalhit|TikTokBot/);
  });
}

// ---------- 23. Sin Plus/Gold/precios futuros en Inscripciones ----------
// Excluye comentarios de código (// ...): el propio encabezado del
// archivo documenta, a propósito, que Plus/Gold NUNCA deben mostrarse —
// eso menciona la palabra sin ser contenido renderizado. Mismo criterio
// de falso positivo ya documentado varias veces en este repo (p.ej. el
// comentario de assertCreatorEligible en Inscripciones, "Reputación
// futura" en Cumplimiento).
test("/inscripciones: contenido renderizado nunca menciona Plus, Gold, 200 inscritos, 2.000/2000, ni 'planes próximamente'", () => {
  const src = read("src/pages/inscripciones.jsx");
  const rendered = src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(rendered, /\bPlus\b/);
  assert.doesNotMatch(rendered, /\bGold\b/);
  assert.doesNotMatch(rendered, /\b200\s+inscritos\b/i);
  assert.doesNotMatch(rendered, /2[.,]?000/);
  assert.doesNotMatch(rendered, /planes?\s+pr[oó]ximamente/i);
});

// ---------- 24. Sin funciones falsas: "Personal de acceso" solo se anuncia porque la función real existe ----------
test("/soluciones/eventos: 'Personal de acceso' solo se anuncia porque src/lib/eventStaffAuth.js (función real) existe", () => {
  const src = read("src/pages/soluciones/eventos.jsx");
  if (/Personal de acceso/.test(src)) {
    assert.ok(exists("src/lib/eventStaffAuth.js"), "la landing anuncia staff de acceso pero la función real no existe");
  }
});

// ---------- 25. Cero cambios a Payment Engine/Trust/webhooks/comisión desde las landings nuevas ----------
test("las 4 landings nuevas/evolucionadas no tocan Payment Engine, Trust, webhooks, ni recalculan la comisión", () => {
  const files = [
    "src/pages/soluciones/eventos.jsx",
    "src/pages/campanas.jsx",
    "src/pages/inscripciones.jsx",
    "src/pages/soluciones/rifas.jsx",
    "src/components/product/ProductSections.jsx",
    "src/lib/productJsonLd.js",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /webhook|marketplace_fee|RIFEX_FEE_RATE\s*=|service_role|mercadopago/i, `${f} no debe tocar lógica de pagos/comisión`);
  }
});
