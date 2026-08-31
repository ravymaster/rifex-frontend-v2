// RIFEX V4 A7 — auditoría pública automatizada. Certifica, por inspección
// estática del código fuente (sin servidor, sin red), los requisitos de
// rastreadores/confianza definidos en la misión V4 A+B: metadata mínima en
// páginas corporativas, robots.txt/sitemap.xml con formato correcto,
// noindex en rutas privadas, ausencia de términos sensibles fuera del
// anexo/landing individual, footer neutral, y que /rifas ya no sea un
// catálogo público.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// Páginas corporativas públicas que deben tener metadata mínima
// (title/description) declarada vía Layout o Head.
const CORPORATE_PAGES = [
  "src/pages/index.js",
  "src/pages/seguridad.js",
  "src/pages/privacidad.js",
  "src/pages/cookies.js",
  "src/pages/uso-aceptable.js",
  "src/pages/reportar.js",
  "src/pages/terminos.js",
  "src/pages/politica-eventos.js",
  "src/pages/reembolsos.js",
  "src/pages/politica-campanas.js",
  "src/pages/reglas-iniciativas-premio.js",
  "src/pages/confianza.js",
  "src/pages/contacto.js",
  "src/pages/cumplimiento.js",
];

for (const page of CORPORATE_PAGES) {
  test(`${page}: existe`, () => {
    assert.ok(exists(page), `falta la página ${page}`);
  });

  test(`${page}: declara title y description`, () => {
    const src = read(page);
    const hasTitle = /title=["'`]|title:\s*["'`]/.test(src) || /<title>/.test(src);
    const hasDescription = /description=["'`]|description:\s*["'`]/.test(src) || /name=["']description["']/.test(src);
    assert.ok(hasTitle, `${page} no declara title`);
    assert.ok(hasDescription, `${page} no declara description`);
  });
}

// Rutas privadas que deben pasar noindex a Layout (o declarar robots
// noindex por su cuenta).
const PRIVATE_PAGES = [
  "src/pages/login.jsx",
  "src/pages/register.jsx",
  "src/pages/reset-password.jsx",
  "src/pages/crear-rifa.jsx",
  "src/pages/crear-evento.jsx",
  "src/pages/crear-colecta.jsx",
  "src/pages/perfil.js",
  "src/pages/mis-iniciativas.jsx",
  "src/pages/404.js",
  "src/pages/checkout/index.js",
  "src/pages/registro/continuar.jsx",
  "src/pages/onboarding/pais.jsx",
];

for (const page of PRIVATE_PAGES) {
  test(`${page}: marcada noindex`, () => {
    const src = read(page);
    const hasNoindex = /noindex/.test(src);
    assert.ok(hasNoindex, `${page} no declara noindex`);
  });
}

test("robots.txt existe y tiene formato válido", () => {
  const src = read("public/robots.txt");
  assert.match(src, /User-agent:\s*\*/);
  assert.match(src, /Sitemap:\s*https:\/\/rifex\.pro\/sitemap\.xml/);
  assert.doesNotMatch(src, /<html/i, "robots.txt no debe ser HTML");
});

test("robots.txt no bloquea /rifas/[id] (individual debe seguir siendo rastreable para OG)", () => {
  const src = read("public/robots.txt");
  const disallowRifas = src.split("\n").some((l) => l.trim() === "Disallow: /rifas");
  assert.equal(disallowRifas, false, "un Disallow: /rifas bloquearía también las landings individuales /rifas/[id]");
});

test("sitemap.xml existe, es XML válido y no incluye rutas privadas ni /rifas", () => {
  const src = read("public/sitemap.xml");
  assert.match(src, /<\?xml/);
  assert.match(src, /<urlset/);
  assert.doesNotMatch(src, /<html/i, "sitemap.xml no debe ser HTML");
  assert.doesNotMatch(src, /\/rifas</, "el sitemap no debe incluir /rifas (catálogo eliminado) ni landings individuales");
  assert.doesNotMatch(src, /\/login</);
  assert.doesNotMatch(src, /\/panel/);
  assert.doesNotMatch(src, /\/crear-rifa</);
});

test("/rifas ya no es un catálogo público (PRODUCT_DECISION_RESOLVED)", () => {
  const src = read("src/pages/rifas.js");
  assert.doesNotMatch(src, /api\/rifas["'`]\)/, "rifas.js no debe seguir llamando al listado público de rifas");
  assert.match(src, /login/, "rifas.js debe redirigir a /login");
});

test("/rifas/[id] sigue existiendo (landing individual intacta)", () => {
  assert.ok(exists("src/pages/rifas/[id].jsx"), "la landing individual de rifas no debe eliminarse");
});

test("/rifas/[id] declara noindex,follow,noarchive y canonical propio", () => {
  const src = read("src/pages/rifas/[id].jsx");
  assert.match(src, /noindex,\s*follow,\s*noarchive/);
  assert.match(src, /canonicalUrl\(/);
});

test("APIs de Rifas necesarias para el producto siguen existiendo", () => {
  for (const api of [
    "src/pages/api/rifas/index.js",
    "src/pages/api/rifas/[id]/index.js",
    "src/pages/api/rifas/[id]/tickets.js",
    "src/pages/api/rifas/[id]/draw.js",
  ]) {
    assert.ok(exists(api), `falta ${api} — una API necesaria de Rifas no debe eliminarse`);
  }
});

test("creación/administración autenticada de Rifas sigue intacta", () => {
  assert.ok(exists("src/pages/crear-rifa.jsx"));
  assert.ok(exists("src/pages/panel/index.js"));
});

test("navegación pública (Layout) no enlaza al catálogo /rifas", () => {
  const src = read("src/components/Layout.jsx");
  assert.doesNotMatch(src, /href=["']\/rifas["']/, "el nav/footer no debe enlazar a /rifas");
});

test("footer no repite identidad global de rifas ('Pagos con Mercado Pago' como promesa única)", () => {
  const src = read("src/components/Layout.jsx");
  assert.doesNotMatch(src, /Pagos con Mercado Pago/);
});

test("footer enlaza las políticas obligatorias", () => {
  const src = read("src/components/Layout.jsx");
  for (const href of ["/terminos", "/privacidad", "/cookies", "/uso-aceptable", "/seguridad", "/cumplimiento", "/reportar"]) {
    assert.match(src, new RegExp(`href=["']${href.replace("/", "\\/")}["']`), `footer no enlaza ${href}`);
  }
});

// Términos sensibles: solo prohibidos en páginas corporativas globales, no
// en el anexo específico de iniciativas con premio ni en la landing
// individual (donde la modalidad debe explicarse honestamente).
const SENSITIVE_TERMS = [/\brifa\b/i, /\bsorteo\b/i, /\bpremio\b/i, /número vendido/i, /comprar número/i];
const CORPORATE_GLOBAL_SURFACES = [
  "src/pages/index.js",
  "src/pages/eventos/index.jsx",
  "src/pages/confianza.js",
  "src/pages/politica-eventos.js",
  "src/pages/politica-campanas.js",
];

for (const page of CORPORATE_GLOBAL_SURFACES) {
  test(`${page}: sin términos sensibles de rifas (identidad corporativa neutral)`, () => {
    const src = read(page);
    for (const re of SENSITIVE_TERMS) {
      assert.doesNotMatch(src, re, `${page} contiene un término sensible de rifas (${re}) fuera del anexo específico`);
    }
  });
}

test("terminos.js ya no afirma que Rifex retiene fondos ni 'Depósito por Rifex'", () => {
  const src = read("src/pages/terminos.js");
  assert.doesNotMatch(src, /retener fondos/i);
  assert.doesNotMatch(src, /Depósito por Rifex/);
});

test("terminos.js conserva el aviso de revisión legal pendiente (no se declara aprobado sin revisión real)", () => {
  const src = read("src/pages/terminos.js");
  assert.match(src, /PENDIENTE DE REVISIÓN POR ABOGADO CHILENO ANTES DE PROD/);
});

test("cumplimiento.js no anuncia C6/reputación pública como activa", () => {
  const src = read("src/pages/cumplimiento.js");
  assert.match(src, /Hoy no existe ningún puntaje/);
  assert.doesNotMatch(src, /puntaje activo|reputación pública activa/i);
});

test("TrustBadge solo renderiza en nivel 3 (nunca inventa un nivel)", () => {
  const src = read("src/components/TrustBadge.jsx");
  assert.match(src, /level !== 3/);
});

test("Meta Pixel sigue gateado por consentimiento explícito", () => {
  const src = read("src/lib/metaPixel.js");
  assert.match(src, /isMetaPixelConfigured/);
  const appSrc = read("src/pages/_app.js");
  assert.match(appSrc, /consent|Consent/);
});

test("publicMetadata.js expone SITE_URL y canonicalUrl de forma pura", () => {
  const src = read("src/lib/publicMetadata.js");
  assert.match(src, /SITE_URL/);
  assert.match(src, /export function canonicalUrl/);
});
