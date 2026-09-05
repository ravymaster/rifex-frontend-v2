// INSCRIPCIONES V1 — PRIVATE SSR AUTH BOUNDARY HARDENING. Certifica por
// inspección estática del código fuente (mismo técnica sin servidor ya
// usada en tests/authUxCrawler.test.mjs) que las 3 superficies
// PRIVATE_AUTHENTICATED de Inscripciones que dependían de un boundary
// client-side histórico (mismo patrón heredado de /panel/eventos, deuda
// documentada y NO corregida en la misión original) ahora demuestran
// SESIÓN server-side ANTES de que el componente privado se renderice —
// un anónimo recibe un redirect real de getServerSideProps, nunca el
// shell del panel/scanner esperando a un useEffect.
//
// Deliberadamente NO toca /panel/eventos/* — esa deuda histórica queda
// fuera del alcance de esta misión (sección 11 del mandato).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PSCG_CATEGORY,
  PSCG_BOUNDARY,
  PSCG_REGISTRY,
  findPscgEntry,
} from "../src/lib/publicSurfaceClassification.js";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const HARDENED_PAGES = [
  { path: "/panel/inscripciones", file: "src/pages/panel/inscripciones/index.jsx" },
  { path: "/panel/inscripciones/[id]", file: "src/pages/panel/inscripciones/[id].jsx" },
  { path: "/panel/inscripciones/[id]/scanner", file: "src/pages/panel/inscripciones/[id]/scanner.jsx" },
];

// ---------- 1-4/12. SSR real presente en las 3 superficies corregidas + PSCG lo refleja ----------
for (const { path: routePath, file } of HARDENED_PAGES) {
  test(`${file}: getServerSideProps real con getSupabaseServer + s.auth.getUser(), redirect a /login?next= si no hay sesión`, () => {
    const src = read(file);
    assert.match(src, /export async function getServerSideProps/);
    assert.match(src, /getSupabaseServer/);
    assert.match(src, /s\.auth\.getUser\(\)/);
    assert.match(src, /redirect:\s*\{\s*destination:\s*[`'"]\/login\?next=/);
  });

  test(`${file}: el redirect de sesión ausente ocurre ANTES de cualquier fetch de datos privados (getServerSideProps retorna { redirect } sin llamar a la API de Inscripciones)`, () => {
    const src = read(file);
    const gsspBlock = src.match(/export async function getServerSideProps[\s\S]*?\n}\n/)[0];
    assert.doesNotMatch(gsspBlock, /\/api\/inscripciones/, "getServerSideProps no debe tocar la API privada — solo demuestra sesión");
  });

  test(`PSCG_REGISTRY: ${routePath} está clasificado PRIVATE_AUTHENTICATED con boundary ssr_redirect (ya no client_redirect)`, () => {
    const entry = findPscgEntry(routePath);
    assert.ok(entry, `falta entrada de PSCG para ${routePath}`);
    assert.equal(entry.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
    assert.equal(entry.boundary, PSCG_BOUNDARY.SSR_REDIRECT);
    assert.notEqual(entry.boundary, PSCG_BOUNDARY.CLIENT_REDIRECT);
  });
}

// ---------- 5. next path safety — construido desde literal fijo + sanitizeNextPath, nunca open redirect ----------
test("panel/inscripciones/index.jsx: next es un literal fijo, sin interpolación de datos de request", () => {
  const src = read("src/pages/panel/inscripciones/index.jsx");
  assert.match(src, /destination:\s*'\/login\?next=\/panel\/inscripciones'/);
});

for (const { file } of HARDENED_PAGES.slice(1)) {
  test(`${file}: next dinámico pasa por sanitizeNextPath (defensa en profundidad) y se codifica con encodeURIComponent antes de ir a la URL`, () => {
    const src = read(file);
    assert.match(src, /import \{ sanitizeNextPath \} from ['"]@\/lib\/countryPolicy['"]/);
    assert.match(src, /sanitizeNextPath\(/);
    assert.match(src, /encodeURIComponent\(next\)/);
  });

  test(`${file}: el prefijo de next siempre es el literal "/panel/inscripciones/" — ningún valor de "id" puede producir una URL externa`, () => {
    const src = read(file);
    assert.match(src, /`\/panel\/inscripciones\/\$\{id\}/);
  });
}

// ---------- 6. crear-inscripcion.jsx: ya cumplía, no se tocó innecesariamente, y conserva la regla de producto (sin MP) ----------
test("crear-inscripcion.jsx: SSR boundary preexistente intacto — sesión + assertOnboardingComplete, NUNCA importa assertCreatorEligible/resolveCreationGate", () => {
  const src = read("src/pages/crear-inscripcion.jsx");
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /getSupabaseServer/);
  assert.match(src, /s\.auth\.getUser\(\)/);
  assert.match(src, /import \{ assertOnboardingComplete \} from/);
  // El comentario del archivo SÍ menciona estos nombres a propósito (para
  // documentar que están explícitamente prohibidos) — lo que nunca debe
  // existir es un `import` real de ninguno de los dos.
  assert.doesNotMatch(src, /import\s*\{[^}]*assertCreatorEligible[^}]*\}\s*from/);
  assert.doesNotMatch(src, /import\s*\{[^}]*resolveCreationGate[^}]*\}\s*from/);
});

// ---------- 7. autorización sigue siendo autoridad del backend, nunca del boundary SSR ----------
test("panel/inscripciones/[id].jsx y scanner.jsx: el boundary SSR nunca decide ownership — cada fetch privado sigue mandando el Bearer token para que la API decida", () => {
  for (const { file } of [HARDENED_PAGES[1], HARDENED_PAGES[2]]) {
    const src = read(file);
    assert.match(src, /Authorization:\s*`Bearer \$\{/);
  }
});

test("check_in_registration_participant / ownership: check-in.js sigue verificando organizer_id server-side (no se debilitó IDOR)", () => {
  const src = read("src/pages/api/inscripciones/[id]/check-in.js");
  assert.match(src, /activity\.organizer_id === user\.id/);
});

// ---------- 8. scanner: createScannerController/QR/atomicidad sin cambios de comportamiento ----------
test("scanner.jsx: createScannerController, parseRegistrationQrPayload y el flujo de check-in POST siguen intactos", () => {
  const src = read("src/pages/panel/inscripciones/[id]/scanner.jsx");
  assert.match(src, /createScannerController/);
  assert.match(src, /parseRegistrationQrPayload/);
  assert.match(src, /\/api\/inscripciones\/\$\{id\}\/check-in/);
});

// ---------- 11. no se tocó Eventos (cierto para ESTA misión, SSR-HARDEN Inscripciones 2026-09-04) ----------
// RIFEX FINAL PUBLIC SURFACE CLOSURE (2026-09-05) — una misión POSTERIOR
// y distinta sí completó ese hardening pendiente sobre /panel/eventos/*
// (mismo patrón ssr_redirect ya certificado acá para Inscripciones). La
// afirmación original — "esta misión [SSR-HARDEN Inscripciones] no tocó
// Eventos" — sigue siendo históricamente cierta; se reformula para no
// perpetuar una prohibición que ya no aplica a misiones futuras.
test("panel/eventos/* no fue modificado por LA MISIÓN SSR-HARDEN INSCRIPCIONES (2026-09-04) — deuda histórica documentada en su momento, cerrada después por FINAL PUBLIC SURFACE CLOSURE (2026-09-05)", () => {
  const eventsEntry = PSCG_REGISTRY.find((e) => e.path === "/panel/eventos");
  assert.ok(eventsEntry, "/panel/eventos debe estar en el registro (agregado por FINAL PUBLIC SURFACE CLOSURE)");
  assert.equal(eventsEntry.boundary, PSCG_BOUNDARY.SSR_REDIRECT, "el hardening pendiente se completó en una misión posterior");
});

// ---------- páginas públicas de Inscripciones siguen públicas ----------
test("/inscripciones sigue PUBLIC_INDEXABLE y /inscripcion/[id] sigue PUBLIC_NOINDEX — esta misión no tocó clasificación pública", () => {
  const landing = findPscgEntry("/inscripciones");
  const detail = findPscgEntry("/inscripcion/[id]");
  assert.equal(landing.category, PSCG_CATEGORY.PUBLIC_INDEXABLE);
  assert.equal(detail.category, PSCG_CATEGORY.PUBLIC_NOINDEX);
});

test("src/pages/inscripciones.jsx y src/pages/inscripcion/[id].jsx no ganaron un getServerSideProps de auth (siguen públicas, sin login)", () => {
  const landingSrc = read("src/pages/inscripciones.jsx");
  const detailSrc = read("src/pages/inscripcion/[id].jsx");
  assert.doesNotMatch(landingSrc, /getServerSideProps/);
  assert.doesNotMatch(detailSrc, /getServerSideProps/);
});

// ---------- robots/sitemap coherentes (regresión, sin cambios necesarios) ----------
test("robots.txt sigue cubriendo /panel/inscripciones/* vía el prefijo Disallow: /panel", () => {
  const robots = read("public/robots.txt");
  assert.match(robots, /Disallow:\s*\/panel(\s|$)/m);
});

test("sitemap.xml no lista ninguna superficie PRIVATE_AUTHENTICATED de Inscripciones", () => {
  const sitemap = read("public/sitemap.xml");
  for (const p of ["/crear-inscripcion", "/panel/inscripciones"]) {
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https://rifex\\.pro${p.replace(/\//g, "\\/")}`));
  }
});
