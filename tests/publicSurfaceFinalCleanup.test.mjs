// RIFEX PUBLIC SURFACE FINAL CLEANUP — certifica por inspección estática
// los invariantes de esta misión: ausencia de deuda jurídica/interna
// filtrada a superficies públicas, coherencia robots/noindex/sitemap,
// grafo público de Rifas correctamente acotado, /rifas y /campanas según
// las decisiones tomadas en esta misión, Trust claims dentro de lo
// implementado, structured data solo con hechos verificables, headers de
// seguridad de bajo riesgo, y ausencia de cloaking por User-Agent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const PUBLIC_PAGES = [
  "src/pages/index.js",
  "src/pages/eventos/index.jsx",
  "src/pages/wizard.js",
  "src/pages/planes.js",
  "src/pages/preguntas-frecuentes.js",
  "src/pages/terminos.js",
  "src/pages/privacidad.js",
  "src/pages/cookies.js",
  "src/pages/uso-aceptable.js",
  "src/pages/seguridad.js",
  "src/pages/cumplimiento.js",
  "src/pages/reportar.js",
  "src/pages/contacto.js",
  "src/pages/politica-eventos.js",
  "src/pages/politica-campanas.js",
  "src/pages/reembolsos.js",
  "src/pages/confianza.js",
];

// ---------- 1-3. Ausencia de warnings internos en superficies públicas ----------
// terminos-rifas.js: el blocker real detectado en la primera pasada de
// esta misión (banner conservado deliberadamente por STAGE2-REPAIR,
// contradiciendo dos tests certificados) fue resuelto por decisión
// humana explícita de Rodrigo (2026-09-03): el banner se retira también
// aquí, y publicAudit.test.mjs se actualizó en consecuencia. Se incluye
// en este loop porque ya no es una excepción.
for (const p of [...PUBLIC_PAGES, "src/pages/terminos-rifas.js"]) {
  test(`${p}: sin warning interno de revisión legal visible ("PENDIENTE DE REVISIÓN", "antes de PROD", "zona gris")`, () => {
    const src = read(p);
    assert.doesNotMatch(src, /PENDIENTE DE REVISI[ÓO]N POR ABOGADO/i);
    assert.doesNotMatch(src, /antes de PROD/i);
    assert.doesNotMatch(src, /zona gris/i);
  });
}

test("terminos-rifas.js: retiro del banner no declara revisión ni cumplimiento jurídico, y las condiciones sustantivas (comisión, entrega, fraude/chargebacks) siguen exactamente iguales", () => {
  const src = read("src/pages/terminos-rifas.js");
  assert.doesNotMatch(src, /revisado por (un )?abogado/i);
  assert.doesNotMatch(src, /cumple jur[íi]dicamente|cumplimiento jur[íi]dico certificado/i);
  assert.match(src, /Rifex cobra un 7% de comisión sobre cada número vendido/);
  assert.match(src, /Fraude y chargebacks/);
  assert.match(src, /Rifex no custodia los fondos de las ventas/);
  assert.match(src, /id="comprador"/);
  assert.match(src, /id="creador"/);
  assert.match(src, /id="rifex"/);
});

test("reglas-iniciativas-premio.js: ya no expone el banner interno de revisión legal (defecto real P0 corregido)", () => {
  const src = read("src/pages/reglas-iniciativas-premio.js");
  assert.doesNotMatch(src, /PENDIENTE DE REVISI[ÓO]N/i);
  assert.doesNotMatch(src, /zona gris/i);
  assert.match(src, /noindex/);
});

// ---------- 4. Contacto sin placeholders internos ----------
test("contacto.js: sin placeholder de identidad legal pendiente de confirmación (defecto real P0 corregido)", () => {
  const src = read("src/pages/contacto.js");
  assert.doesNotMatch(src, /pendiente de confirmaci[óo]n/i);
  assert.doesNotMatch(src, /identidad legal completa del operador/i);
});

// ---------- 5-7. Clasificación de rutas: robots/noindex/sitemap coherentes ----------
test("sitemap.xml: solo lista superficies PUBLIC_INDEXABLE reales, ninguna protegida/legacy/anexo", () => {
  const sitemap = read("public/sitemap.xml");
  for (const p of ["/crear-rifa", "/crear-colecta", "/crear-evento", "/panel", "/mis-iniciativas", "/rifas<", "/login", "/register", "/blog", "reglas-iniciativas-premio", "terminos-rifas"]) {
    assert.doesNotMatch(sitemap, new RegExp(p.replace(/\//g, "\\/")));
  }
});

test("robots.txt: Disallow explícito de superficies auth-boundary, sin bloquear el anexo PUBLIC_NOINDEX", () => {
  const robots = read("public/robots.txt");
  for (const p of ["/crear-rifa", "/crear-evento", "/crear-colecta", "/mis-iniciativas", "/panel", "/login", "/register"]) {
    assert.match(robots, new RegExp(`Disallow:\\s*${p.replace("/", "\\/")}`));
  }
  // reglas-iniciativas-premio y terminos-rifas usan noindex crawlable
  // (Google debe poder ver el noindex), no Disallow — evita la
  // contradicción robots/noindex que Google desaconseja.
  assert.doesNotMatch(robots, /Disallow:\s*\/reglas-iniciativas-premio/);
  assert.doesNotMatch(robots, /Disallow:\s*\/terminos-rifas/);
});

test("reglas-iniciativas-premio.js y terminos-rifas.js: noindex declarado, fuera de sitemap, no bloqueados por robots (patrón PUBLIC_NOINDEX correcto)", () => {
  for (const p of ["src/pages/reglas-iniciativas-premio.js", "src/pages/terminos-rifas.js"]) {
    const src = read(p);
    assert.match(src, /noindex/);
  }
});

// ---------- 8, 13. /rifas: redirect real server-side, no solo client-side ----------
test("rifas.js: redirect real vía getServerSideProps (no depende de JS en el cliente para redirigir), X-Robots-Tag noindex,nofollow, next sanitizado", () => {
  const src = read("src/pages/rifas.js");
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /redirect:\s*\{\s*destination:\s*`\/login\?next=/);
  assert.match(src, /permanent:\s*false/);
  assert.match(src, /X-Robots-Tag['"],\s*['"]noindex,\s*nofollow['"]/);
  assert.match(src, /raw\.startsWith\('\/'\)/, "debe seguir sanitizando next contra URLs externas");
});

// ---------- 9. No crawler-specific rendering (no cloaking) ----------
test("ninguna página pública ni Layout.jsx bifurca contenido según User-Agent/navigator.userAgent", () => {
  const files = [...PUBLIC_PAGES, "src/components/Layout.jsx", "src/pages/rifas.js"];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /user-agent/i, `${f} no debe referenciar User-Agent`);
    assert.doesNotMatch(src, /navigator\.userAgent/, `${f} no debe leer navigator.userAgent`);
    assert.doesNotMatch(src, /googlebot|bingbot|facebookexternalhit|bytespider|tiktokbot/i, `${f} no debe identificar bots por nombre`);
  }
});

// ---------- 10. Home sin identidad pública de rifas ----------
test("index.js (Home): sin rifa/rifas/sorteo/sorteos/premio/premios en el contenido renderizado (comentarios de código excluidos)", () => {
  const src = read("src/pages/index.js");
  const start = src.indexOf("export default function Home()");
  const end = src.indexOf("Home.getLayout");
  assert.ok(start !== -1 && end !== -1 && end > start, "no se pudo acotar el componente Home");
  const rendered = src.slice(start, end);
  assert.doesNotMatch(rendered, /\brifas?\b/i);
  assert.doesNotMatch(rendered, /\bsorteos?\b/i);
  assert.doesNotMatch(rendered, /\bpremios?\b/i);
});

// ---------- 11-12. Login/Register neutral, Blog privado (re-certificación liviana) ----------
test("login.jsx y register.jsx: título neutral (Ingresar/Crear cuenta), sin copy de Rifas", () => {
  const login = read("src/pages/login.jsx");
  const register = read("src/pages/register.jsx");
  assert.match(login, />Ingresar</);
  assert.doesNotMatch(login, /\brifas?\b/i);
  assert.doesNotMatch(register, /\brifas?\b/i);
});

test("blog/index.js: noindex,nofollow,noarchive declarado, sin fetch anónimo de posts", () => {
  const src = read("src/pages/blog/index.js");
  assert.match(src, /noindex,\s*nofollow,\s*noarchive/);
  assert.match(src, /router\.push\(`\/login\?next=/);
});

// ---------- 14. Grafo público sin enlaces accidentales a Rifas ----------
test("Home, navbar, footer, wizard.js y terminos.js no enlazan directamente a /reglas-iniciativas-premio ni /terminos-rifas (solo /reembolsos y el propio /terminos-rifas lo hacen, ya certificado)", () => {
  const files = ["src/pages/index.js", "src/components/Layout.jsx", "src/pages/wizard.js", "src/pages/terminos.js"];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /href="\/reglas-iniciativas-premio"/, `${f} no debe enlazar directo al anexo`);
    assert.doesNotMatch(src, /href="\/terminos-rifas"/, `${f} no debe enlazar directo a los términos de Rifas`);
  }
  const reembolsos = read("src/pages/reembolsos.js");
  assert.match(reembolsos, /href="\/reglas-iniciativas-premio"/, "reembolsos.js sí debe conservar el enlace legítimo ya auditado");
});

// ---------- 15. Trust claims dentro de lo implementado ----------
test("confianza.js: usa la misma formulación cuidadosa que /seguridad ('aplica controles de... validación de identidad'), no 'verifica'/'validamos'/'contrastamos' en presente incondicional", () => {
  const src = read("src/pages/confianza.js");
  assert.doesNotMatch(src, /Rifex verifica la identidad/i);
  assert.doesNotMatch(src, /c[óo]mo validamos al organizador y contrastamos/i);
  assert.match(src, /aplica controles de registro, validaci[óo]n de identidad y titularidad/);
});

test("seguridad.js: conserva la formulación cuidadosa aprobada y no usa claims absolutos (comentarios de código excluidos)", () => {
  const src = read("src/pages/seguridad.js");
  const rendered = src.slice(src.indexOf("export default function Seguridad()"));
  assert.match(rendered, /Rifex aplica controles de registro, validaci[óo]n de identidad y titularidad de cuentas antes de habilitar/);
  assert.doesNotMatch(rendered, /100% segur/i);
  assert.doesNotMatch(rendered, /sin fraude/i);
  assert.doesNotMatch(rendered, /biometr[íi]a/i);
});

// ---------- 16. Canonical rifex.pro ----------
test("todas las páginas públicas con canonicalPath usan rutas relativas resueltas contra rifex.pro (SITE_URL), nunca un dominio hardcodeado distinto", () => {
  for (const p of PUBLIC_PAGES) {
    const src = read(p);
    const canon = src.match(/canonicalPath="([^"]*)"/);
    if (canon) assert.doesNotMatch(canon[1], /^https?:\/\/(?!rifex\.pro)/, `${p}: canonicalPath no debe apuntar a otro dominio`);
  }
});

// ---------- 17. Structured data: solo hechos verificables ----------
test("index.js: JSON-LD Organization + WebSite con solo hechos verificables (nombre, url, logo real), sin aggregateRating/review/address/sameAs/foundingDate inventados", () => {
  const src = read("src/pages/index.js");
  const start = src.indexOf("const ORGANIZATION_JSON_LD");
  const end = src.indexOf("const TRUST_ITEMS");
  assert.ok(start !== -1 && end !== -1 && end > start, "no se pudo acotar los objetos JSON-LD");
  const jsonLd = src.slice(start, end);
  assert.match(jsonLd, /'@type':\s*'Organization'/);
  assert.match(jsonLd, /'@type':\s*'WebSite'/);
  assert.match(jsonLd, /name:\s*'Rifex'/);
  assert.doesNotMatch(jsonLd, /aggregateRating/);
  assert.doesNotMatch(jsonLd, /['"]review['"]/i);
  assert.doesNotMatch(jsonLd, /streetAddress|addressLocality/);
  assert.doesNotMatch(jsonLd, /sameAs/);
  assert.doesNotMatch(jsonLd, /foundingDate/);
});

// ---------- 18. Security headers de bajo riesgo, sin CSP forzada ----------
test("next.config.mjs: headers() agrega X-Content-Type-Options/Referrer-Policy/X-Frame-Options/Permissions-Policy, sin tocar Content-Security-Policy", () => {
  const src = read("next.config.mjs");
  assert.match(src, /X-Content-Type-Options/);
  assert.match(src, /nosniff/);
  assert.match(src, /Referrer-Policy/);
  assert.match(src, /X-Frame-Options/);
  assert.match(src, /SAMEORIGIN/);
  assert.match(src, /Permissions-Policy/);
  assert.doesNotMatch(src, /Content-Security-Policy/);
});

test("Permissions-Policy permite explícitamente camera y clipboard-write (usados de verdad por el scanner QR y compartir colecta), deshabilita lo no usado", () => {
  const src = read("next.config.mjs");
  const policy = src.match(/Permissions-Policy['"],\s*\n?\s*value:\s*'([^']*)'/);
  assert.ok(policy, "no se encontró el valor de Permissions-Policy");
  assert.match(policy[1], /camera=\(self\)/);
  assert.match(policy[1], /clipboard-write=\(self\)/);
  assert.match(policy[1], /microphone=\(\)/);
  assert.match(policy[1], /geolocation=\(\)/);
});

// ---------- 19. /campanas: navItem apunta al explicador real, sin landing duplicada ----------
test("Layout.jsx: navItem 'Campañas' apunta a /wizard?modo=colecta (explicador real ya certificado), no directo a /crear-colecta", () => {
  const src = read("src/components/Layout.jsx");
  const campaniasItem = src.match(/\{\s*label:\s*'Campañas',\s*href:\s*'([^']*)'/);
  assert.ok(campaniasItem, "no se encontró el navItem 'Campañas'");
  assert.equal(campaniasItem[1], "/wizard?modo=colecta");
});

test("wizard.js: preselecciona el modo (evento/colecta) desde ?modo=, para que el navItem 'Campañas' abra directo el explicador de campañas", () => {
  const src = read("src/pages/wizard.js");
  assert.match(src, /router\.query\?\.modo/);
  assert.match(src, /modo === 'colecta'/);
});

// ---------- 20. Ausencia de regresiones en políticas públicas ----------
test("comisión 7% consistente en terminos.js/planes.js/politica-campanas.js/politica-eventos.js, sin referencias a Argentina/ARS en superficies públicas", () => {
  for (const p of ["src/pages/terminos.js", "src/pages/planes.js", "src/pages/politica-campanas.js", "src/pages/politica-eventos.js"]) {
    const src = read(p);
    assert.doesNotMatch(src, /Argentina|\bARS\b/);
  }
});

test("custody de fondos: las páginas públicas que lo mencionan siempre lo niegan (Rifex no custodia), nunca afirman lo contrario", () => {
  for (const p of ["src/pages/reembolsos.js", "src/pages/uso-aceptable.js", "src/pages/politica-campanas.js"]) {
    const src = read(p);
    if (/custodia/i.test(src)) {
      assert.match(src, /no custodia/i, `${p} menciona custodia pero no la niega`);
    }
  }
});
