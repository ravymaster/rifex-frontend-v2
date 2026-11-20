// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — certifica los 30
// puntos de la sección 25 del mandato: consolidación de /eventos,
// retiro de /soluciones/eventos, Rifas fuera del navbar/menú de cuenta,
// "Cómo funciona" fuera del navbar, /admin y /panel/eventos/* con SSR
// auth real, /reglas-iniciativas-premio privada, Home con Inscripciones,
// sección de redes sociales real (sin placeholders falsos), y ausencia
// de regresión en Payment/Trust/comisión/business logic. Las pruebas
// "200 anónimo"/"redirect real multi-UA" en vivo se ejecutan aparte
// contra un servidor real — este archivo certifica lo estático.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PSCG_CATEGORY,
  PSCG_BOUNDARY,
  findPscgEntry,
} from "../src/lib/publicSurfaceClassification.js";
import { SOCIAL_LINKS } from "../src/lib/socialLinks.js";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const sitemap = read("public/sitemap.xml");
const robots = read("public/robots.txt");

// ---------- 1. /eventos es la landing canonical ----------
test("1. /eventos: canonicalPath propio, PUBLIC_INDEXABLE, es la URL única y definitiva de Eventos", () => {
  const src = read("src/pages/eventos/index.jsx");
  assert.match(src, /canonicalPath="\/eventos"/);
  const entry = findPscgEntry("/eventos");
  assert.equal(entry.category, PSCG_CATEGORY.PUBLIC_INDEXABLE);
});

// ---------- 2-3. Catálogo: retirado por decisión explícita (2026-09-05), no vacío igual ----------
// Rodrigo pidió explícitamente retirar el catálogo/empty-state de
// /eventos por ahora (todavía no hay eventos reales publicados en PROD y
// un empty-state no aporta valor hoy) — queda documentado para
// integrarse más adelante. La página nunca queda vacía porque sigue
// siendo la landing completa (hero/features/pasos/casos de uso/
// operacional/seguridad/FAQ/CTA), con contenido real todo el tiempo.
test("2-3. /eventos: catálogo retirado por decisión de producto (2026-09-05) — la página sigue siendo la landing completa, nunca vacía, sin depender de si existen eventos publicados", () => {
  const src = read("src/pages/eventos/index.jsx");
  assert.doesNotMatch(src, /fetch\('\/api\/events'\)/, "el fetch del catálogo se retiró por ahora");
  assert.doesNotMatch(src, /catalogo-eventos/);
  assert.match(src, /<ProductHero/);
  assert.match(src, /<ProductFaq/);
  assert.match(src, /<ProductFinalCta/);
});

// ---------- 4. /soluciones/eventos: redirect permanente ----------
test("4. /soluciones/eventos: redirect permanente (308) real hacia /eventos, LEGACY_REMOVED", () => {
  const src = read("src/pages/soluciones/eventos.jsx");
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /redirect:\s*\{\s*destination:\s*['"`]\/eventos['"`],\s*permanent:\s*true/);
  const entry = findPscgEntry("/soluciones/eventos");
  assert.equal(entry.category, PSCG_CATEGORY.LEGACY_REMOVED);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/rifex\.pro\/soluciones\/eventos<\/loc>/);
});

// ---------- 5-6. Campañas e Inscripciones públicas, sin cambio ----------
test("5. /campanas sigue PUBLIC_INDEXABLE, en sitemap, sin auth boundary", () => {
  const entry = findPscgEntry("/campanas");
  assert.equal(entry.category, PSCG_CATEGORY.PUBLIC_INDEXABLE);
  assert.match(sitemap, /<loc>https:\/\/rifex\.pro\/campanas<\/loc>/);
  assert.doesNotMatch(read("src/pages/campanas.jsx"), /getServerSideProps/);
});

test("6. /inscripciones sigue PUBLIC_INDEXABLE, en sitemap, sin auth boundary, sin Plus/Gold", () => {
  const entry = findPscgEntry("/inscripciones");
  assert.equal(entry.category, PSCG_CATEGORY.PUBLIC_INDEXABLE);
  assert.match(sitemap, /<loc>https:\/\/rifex\.pro\/inscripciones<\/loc>/);
  const src = read("src/pages/inscripciones.jsx");
  assert.doesNotMatch(src, /getServerSideProps/);
  const rendered = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(rendered, /\bPlus\b|\bGold\b/);
});

// ---------- 7. Rifas fuera del menú de cuenta superior ----------
test("7. accountItems (menú de cuenta superior) YA NO incluye 'Rifas'", () => {
  const src = read("src/components/Layout.jsx");
  const match = src.match(/const accountItems = \[[\s\S]*?\];/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /label:\s*'Rifas'/);
});

// ---------- 8. Rifas presente solo en el footer autenticado ----------
test("8. footer: 'Cómo funcionan las Rifas' solo se renderiza cuando hay sesión (user truthy), nunca en navItems", () => {
  const src = read("src/components/Layout.jsx");
  const footerBlock = src.match(/<footer[\s\S]*?<\/footer>/)[0];
  assert.match(footerBlock, /\{user\s*&&\s*<Link href="\/soluciones\/rifas">Cómo funcionan las Rifas<\/Link>\}/);
  const navBlock = src.match(/const navItems = \[[\s\S]*?\];/)[0];
  assert.doesNotMatch(navBlock, /rifas/i);
});

// ---------- 9. Rifas: SSR privado real ----------
test("9. /soluciones/rifas: PRIVATE_AUTHENTICATED + ssr_redirect, noindex+nofollow+noarchive, fuera de sitemap", () => {
  const entry = findPscgEntry("/soluciones/rifas");
  assert.equal(entry.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
  assert.equal(entry.boundary, PSCG_BOUNDARY.SSR_REDIRECT);
  const src = read("src/pages/soluciones/rifas.jsx");
  assert.match(src, /noindex/);
  assert.match(src, /noarchive/);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/rifex\.pro\/soluciones\/rifas<\/loc>/);
});

// ---------- 10. reglas-iniciativas-premio: SSR privado real ----------
test("10. /reglas-iniciativas-premio: PRIVATE_AUTHENTICATED + ssr_redirect real (getSupabaseServer + redirect a /login antes de renderizar)", () => {
  const entry = findPscgEntry("/reglas-iniciativas-premio");
  assert.equal(entry.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
  assert.equal(entry.boundary, PSCG_BOUNDARY.SSR_REDIRECT);
  const src = read("src/pages/reglas-iniciativas-premio.js");
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /getSupabaseServer/);
  assert.match(src, /redirect:\s*\{\s*destination:\s*['"`]\/login\?next=\/reglas-iniciativas-premio['"`]/);
  assert.match(robots, /Disallow:\s*\/reglas-iniciativas-premio/);
});

// ---------- 11. /reembolsos ya no fuga el link privado ----------
test("11. /reembolsos: ya no enlaza a /reglas-iniciativas-premio (ahora privada) — copy neutral sin link, no es un dead link porque no hay link", () => {
  const src = read("src/pages/reembolsos.js");
  assert.doesNotMatch(src, /href="\/reglas-iniciativas-premio"/);
  assert.match(src, /Iniciativas con premio/);
  assert.match(src, /disponibles para el organizador/);
});

// ---------- 12. "Cómo funciona" fuera del navbar ----------
test("12. navItems: sin 'Cómo funciona' (retirado), exactamente Eventos/Campañas/Inscripciones", () => {
  const src = read("src/components/Layout.jsx");
  const match = src.match(/const navItems = \[[\s\S]*?\];/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /label:\s*'Cómo funciona'/);
  assert.match(match[0], /label:\s*'Eventos'/);
  assert.match(match[0], /label:\s*'Campañas'/);
  assert.match(match[0], /label:\s*'Inscripciones'/);
});

// ---------- 13. /wizard: decisión final (sigue existiendo, PUBLIC_NOINDEX) ----------
test("13. /wizard: sigue existiendo (no eliminado, no redirigido) pero pasa a PUBLIC_NOINDEX — fuera de sitemap, con Disallow", () => {
  assert.ok(exists("src/pages/wizard.js"), "wizard.js no debe eliminarse");
  const entry = findPscgEntry("/wizard");
  assert.equal(entry.category, PSCG_CATEGORY.PUBLIC_NOINDEX);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/rifex\.pro\/wizard<\/loc>/);
  assert.match(robots, /Disallow:\s*\/wizard/);
  const src = read("src/pages/wizard.js");
  assert.match(src, /noindex/);
});

// ---------- 14. /admin: autenticación + autorización real ----------
test("14. /admin: getServerSideProps real — anónimo a /login, no-admin a Home, admin real a props{} — misma autoridad que resolveAdmin (app_metadata.role)", () => {
  const entry = findPscgEntry("/admin");
  assert.equal(entry.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
  assert.equal(entry.boundary, PSCG_BOUNDARY.SSR_REDIRECT);
  const src = read("src/pages/admin/index.jsx");
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /getSupabaseServer/);
  assert.match(src, /redirect:\s*\{\s*destination:\s*["'`]\/login\?next=\/admin["'`]/);
  assert.match(src, /user\.app_metadata\?\.role\s*!==\s*["'`]admin["'`]/);
  assert.match(robots, /Disallow:\s*\/admin/);
  // La autoridad real de cada acción admin sigue en resolveAdmin, sin un segundo sistema de roles.
  const adminAuth = read("src/lib/adminAuth.js");
  assert.match(adminAuth, /app_metadata\?\.role\s*!==\s*["'`]admin["'`]/, "debe ser exactamente el mismo campo de autoridad");
});

// ---------- 15. /panel/eventos/*: SSR auth real ----------
test("15. /panel/eventos, [id] y [id]/scanner: getServerSideProps real con getSupabaseServer, mismo patrón certificado que Inscripciones", () => {
  for (const p of ["/panel/eventos", "/panel/eventos/[id]", "/panel/eventos/[id]/scanner"]) {
    const entry = findPscgEntry(p);
    assert.ok(entry, `${p} debe estar en PSCG_REGISTRY`);
    assert.equal(entry.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
    assert.equal(entry.boundary, PSCG_BOUNDARY.SSR_REDIRECT);
    const src = read(entry.file);
    assert.match(src, /export async function getServerSideProps/);
    assert.match(src, /getSupabaseServer/);
    assert.match(src, /redirect:\s*\{\s*destination:\s*[`'"]\/login\?next=/);
  }
});

// ---------- 16. Home incluye Inscripciones ----------
test("16. Home: eyebrow del hero menciona Inscripciones y existe un card real con link a /inscripciones", () => {
  const src = read("src/pages/index.js");
  assert.match(src, /Inscripciones/);
  assert.match(src, /href:\s*['"`]\/inscripciones['"`]/);
});

// ---------- 17-21. Redes sociales: preparadas, sin placeholders falsos ----------
test("17. footer: sección 'Síguenos en redes sociales' preparada con SOCIAL_LINKS", () => {
  const src = read("src/components/Layout.jsx");
  assert.match(src, /Síguenos en redes sociales/);
  assert.match(src, /SOCIAL_LINKS/);
});

test("18. SOCIAL_LINKS: youtube y x son null (preparados, sin URL real todavía) y el bloque de íconos sociales nunca renderiza href=\"#\"", () => {
  assert.equal(SOCIAL_LINKS.youtube, null);
  assert.equal(SOCIAL_LINKS.x, null);
  const src = read("src/components/Layout.jsx");
  const socialBlock = src.match(/rf-foot__social[\s\S]*?<\/div>\s*\)\s*\}/);
  assert.ok(socialBlock, "no se encontró el bloque de redes sociales");
  // El comentario explicativo de este mismo bloque menciona href="#" en
  // prosa para documentar que NUNCA se usa — se descartan las líneas de
  // comentario antes de buscar el atributo real, mismo criterio ya usado
  // en otros self-audits de este repo.
  const rendered = socialBlock[0]
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.includes("cero href="))
    .join("\n");
  assert.doesNotMatch(rendered, /href="#"/);
  assert.doesNotMatch(rendered, /href=\{['"`]#['"`]\}/);
});

test("19. Facebook: URL real configurada y renderizada condicionalmente", () => {
  assert.equal(SOCIAL_LINKS.facebook, "https://www.facebook.com/rifexpro/");
  const src = read("src/components/Layout.jsx");
  assert.match(src, /SOCIAL_LINKS\.facebook\s*&&/);
  assert.match(src, /aria-label="Rifex en Facebook"/);
});

test("20. Instagram: URL real configurada y renderizada condicionalmente", () => {
  assert.equal(SOCIAL_LINKS.instagram, "https://www.instagram.com/rifexpro/");
  const src = read("src/components/Layout.jsx");
  assert.match(src, /SOCIAL_LINKS\.instagram\s*&&/);
  assert.match(src, /aria-label="Rifex en Instagram"/);
});

test("21. TikTok: URL real configurada y renderizada condicionalmente; WhatsApp también presente con wa.me", () => {
  assert.equal(SOCIAL_LINKS.tiktok, "https://www.tiktok.com/@rifexpro");
  assert.equal(SOCIAL_LINKS.whatsapp, "https://wa.me/56959904311");
  const src = read("src/components/Layout.jsx");
  assert.match(src, /SOCIAL_LINKS\.tiktok\s*&&/);
  assert.match(src, /SOCIAL_LINKS\.whatsapp\s*&&/);
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer"/);
});

// ---------- 22. Sitemap correcto ----------
test("22. sitemap.xml: contiene exactamente Eventos/Campañas/Inscripciones entre las 4 rutas de producto, sin /soluciones/eventos, /soluciones/rifas ni /wizard", () => {
  assert.match(sitemap, /<loc>https:\/\/rifex\.pro\/eventos<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/rifex\.pro\/campanas<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/rifex\.pro\/inscripciones<\/loc>/);
  for (const bad of ["/soluciones/eventos", "/soluciones/rifas", "/wizard", "/reglas-iniciativas-premio", "/admin", "/panel"]) {
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https://rifex\\.pro${bad.replace(/\//g, "\\/")}`));
  }
});

// ---------- 23. PSCG correcto para todas las rutas tocadas ----------
test("23. PSCG_REGISTRY: clasificación final correcta para las 8 rutas tocadas/creadas por esta misión", () => {
  const expected = [
    ["/eventos", PSCG_CATEGORY.PUBLIC_INDEXABLE],
    ["/campanas", PSCG_CATEGORY.PUBLIC_INDEXABLE],
    ["/inscripciones", PSCG_CATEGORY.PUBLIC_INDEXABLE],
    ["/soluciones/eventos", PSCG_CATEGORY.LEGACY_REMOVED],
    ["/soluciones/rifas", PSCG_CATEGORY.PRIVATE_AUTHENTICATED],
    ["/reglas-iniciativas-premio", PSCG_CATEGORY.PRIVATE_AUTHENTICATED],
    ["/admin", PSCG_CATEGORY.PRIVATE_AUTHENTICATED],
    ["/panel/eventos", PSCG_CATEGORY.PRIVATE_AUTHENTICATED],
    ["/wizard", PSCG_CATEGORY.PUBLIC_NOINDEX],
  ];
  for (const [p, cat] of expected) {
    const entry = findPscgEntry(p);
    assert.ok(entry, `${p} debe estar registrado`);
    assert.equal(entry.category, cat, `${p} debe ser ${cat}`);
  }
});

// ---------- 24. Canonical de Eventos único (sin competidor) ----------
test("24. Ningún archivo declara canonicalPath=\"/soluciones/eventos\" — /eventos es el único canonical de Eventos", () => {
  const files = ["src/pages/eventos/index.jsx", "src/pages/soluciones/eventos.jsx"];
  for (const f of files) {
    assert.doesNotMatch(read(f), /canonicalPath="\/soluciones\/eventos"/);
  }
  assert.match(read("src/pages/eventos/index.jsx"), /canonicalPath="\/eventos"/);
});

// ---------- 25. Sin duplicación SEO: solo una página con JSON-LD Service de Eventos ----------
test("25. Solo /eventos/index.jsx declara Service JSON-LD de Eventos — /soluciones/eventos (redirect) no tiene JSON-LD", () => {
  assert.match(read("src/pages/eventos/index.jsx"), /buildServiceJsonLd/);
  assert.doesNotMatch(read("src/pages/soluciones/eventos.jsx"), /buildServiceJsonLd|application\/ld\+json/);
});

// ---------- 26-28. Estructura anti-cloaking en todas las rutas tocadas ----------
test("26-28. Ninguna ruta tocada por esta misión condiciona su HTML/redirect por User-Agent (estructuralmente imposible de cloakear)", () => {
  const files = [
    "src/pages/eventos/index.jsx",
    "src/pages/soluciones/eventos.jsx",
    "src/pages/reglas-iniciativas-premio.js",
    "src/pages/admin/index.jsx",
    "src/pages/panel/eventos/index.jsx",
    "src/pages/panel/eventos/[id].jsx",
    "src/pages/panel/eventos/[id]/scanner.jsx",
    "src/components/Layout.jsx",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /user-agent/i, `${f} no debe leer/condicionar por User-Agent`);
    assert.doesNotMatch(src, /Googlebot|facebookexternalhit|TikTokBot/, `${f} no debe mencionar crawlers específicos`);
  }
});

// ---------- 29. Sin notas internas filtradas a superficie pública ----------
// TODO/FIXME se buscan en MAYÚSCULAS y con límite de palabra, sensible a
// mayúsculas — "todo" en minúscula es una palabra española normal
// ("Todo lo que puedes hacer") y daría un falso positivo si la búsqueda
// fuera case-insensitive, como ya pasó una vez al escribir este test.
test("29. Las páginas públicas/tocadas no contienen marcadores TODO/FIXME ni notas internas (localhost/staging/'pendiente de revisión'/'antes de PROD'/'zona gris') en contenido renderizado", () => {
  const files = [
    "src/pages/eventos/index.jsx",
    "src/pages/campanas.jsx",
    "src/pages/inscripciones.jsx",
    "src/pages/index.js",
  ];
  const forbiddenCaseSensitive = /\bTODO\b|\bFIXME\b/;
  const forbiddenCaseInsensitive = /localhost|\bstaging\b|pendiente de revisi[óo]n|antes de PROD|zona gris/i;
  for (const f of files) {
    const src = read(f);
    const rendered = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(rendered, forbiddenCaseSensitive, `${f} no debe filtrar marcadores TODO/FIXME al contenido renderizado`);
    assert.doesNotMatch(rendered, forbiddenCaseInsensitive, `${f} no debe filtrar notas internas al contenido renderizado`);
  }
});

// ---------- 30. Sin regresión de negocio: Payment/Trust/webhook/comisión intactos ----------
// admin/index.jsx ya mostraba "webhook_events" (reconciliación real,
// read-only, pre-existente a esta misión) — por eso este test revisa
// solo el DIFF real que esta misión introdujo (el bloque
// getServerSideProps agregado a cada archivo), no el archivo completo,
// para no marcar como regresión contenido legítimo ya certificado antes.
test("30. El getServerSideProps agregado por esta misión no toca Payment Engine, Trust, webhooks, ni recalcula comisión", () => {
  const filesWithNewGate = [
    "src/pages/admin/index.jsx",
    "src/pages/panel/eventos/index.jsx",
    "src/pages/panel/eventos/[id].jsx",
    "src/pages/panel/eventos/[id]/scanner.jsx",
    "src/pages/reglas-iniciativas-premio.js",
  ];
  const forbidden = /webhook|marketplace_fee|RIFEX_FEE_RATE\s*=|PLATFORM_FEE_RATE\s*=|service_role/i;
  for (const f of filesWithNewGate) {
    const src = read(f);
    const gateBlock = src.match(/export async function getServerSideProps[\s\S]*?\n\}/);
    assert.ok(gateBlock, `${f} debe tener el getServerSideProps agregado`);
    assert.doesNotMatch(gateBlock[0], forbidden, `${f}: el gate agregado no debe tocar lógica de pagos/comisión`);
  }

  // Archivos enteramente nuevos de esta misión — sí se revisan completos.
  const newFiles = [
    "src/pages/eventos/index.jsx",
    "src/pages/soluciones/eventos.jsx",
    "src/lib/socialLinks.js",
  ];
  for (const f of newFiles) {
    assert.doesNotMatch(read(f), forbidden, `${f} no debe tocar lógica de pagos/comisión`);
  }
});
