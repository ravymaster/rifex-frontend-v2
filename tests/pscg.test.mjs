// PUBLIC SURFACE CLASSIFICATION GUARD — certifica que el registro
// (src/lib/publicSurfaceClassification.js) es internamente consistente
// y que sus afirmaciones sobre cada ruta real (sitemap, robots, boundary
// de auth) coinciden con el código real, no con lo que se supone que
// debería pasar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PSCG_CATEGORY,
  PSCG_BOUNDARY,
  PSCG_REGISTRY,
  isValidPscgCategory,
  findPscgEntry,
} from "../src/lib/publicSurfaceClassification.js";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const sitemap = read("public/sitemap.xml");
const robots = read("public/robots.txt");

// ---------- 1. cada ruta clasificada tiene categoría válida ----------
test("PSCG_REGISTRY: cada entrada tiene una categoría válida de las 4 definidas", () => {
  assert.ok(PSCG_REGISTRY.length > 0, "el registro no puede estar vacío");
  for (const entry of PSCG_REGISTRY) {
    assert.ok(entry.path && entry.path.startsWith("/"), `path inválido: ${JSON.stringify(entry)}`);
    assert.ok(
      isValidPscgCategory(entry.category),
      `categoría inválida para ${entry.path}: ${entry.category}`
    );
  }
});

test("PSCG_REGISTRY: sin rutas duplicadas", () => {
  const paths = PSCG_REGISTRY.map((e) => e.path);
  assert.equal(new Set(paths).size, paths.length, "hay paths repetidos en el registro");
});

// ---------- 2/3. PRIVATE_AUTHENTICATED: auth boundary + fuera de sitemap ----------
const privateEntries = PSCG_REGISTRY.filter((e) => e.category === PSCG_CATEGORY.PRIVATE_AUTHENTICATED);

test("PSCG: hay al menos una ruta PRIVATE_AUTHENTICATED registrada", () => {
  assert.ok(privateEntries.length > 0);
});

for (const entry of privateEntries) {
  test(`PRIVATE_AUTHENTICATED ${entry.path}: fuera de sitemap.xml`, () => {
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https://rifex\\.pro${entry.path}</loc>`));
  });
}

const ssrRedirectEntries = privateEntries.filter((e) => e.boundary === PSCG_BOUNDARY.SSR_REDIRECT);
for (const entry of ssrRedirectEntries) {
  test(`PRIVATE_AUTHENTICATED ${entry.path} (boundary ssr_redirect): getServerSideProps real con getSupabaseServer y redirect a login`, () => {
    const src = read(entry.file);
    assert.match(src, /export async function getServerSideProps/);
    assert.match(src, /getSupabaseServer/);
    assert.match(src, /s\.auth\.getUser\(\)/);
    assert.match(src, /redirect:\s*\{\s*destination:\s*['"`]\/login\?next=/);
  });
}

const ssrGateEntries = privateEntries.filter((e) => e.boundary === PSCG_BOUNDARY.SSR_GATE_REDIRECT);
for (const entry of ssrGateEntries) {
  test(`PRIVATE_AUTHENTICATED ${entry.path} (boundary ssr_gate_redirect): getServerSideProps delega en un gate compartido`, () => {
    const src = read(entry.file);
    assert.match(src, /export async function getServerSideProps/);
    assert.match(src, /resolveCreationGate/);
  });
}

// ---------- 4. PUBLIC_INDEXABLE: presente en sitemap, sin Disallow ----------
const publicEntries = PSCG_REGISTRY.filter((e) => e.category === PSCG_CATEGORY.PUBLIC_INDEXABLE);

test("PSCG: hay al menos una ruta PUBLIC_INDEXABLE registrada", () => {
  assert.ok(publicEntries.length > 0);
});

for (const entry of publicEntries) {
  test(`PUBLIC_INDEXABLE ${entry.path}: presente en sitemap.xml`, () => {
    assert.match(sitemap, new RegExp(`<loc>https://rifex\\.pro${entry.path === "/" ? "/" : entry.path}</loc>`));
  });

  test(`PUBLIC_INDEXABLE ${entry.path}: no está en el Disallow de robots.txt`, () => {
    const disallowLines = robots.split("\n").filter((l) => l.startsWith("Disallow:"));
    const blocked = disallowLines.some((l) => {
      const blockedPath = l.replace("Disallow:", "").trim();
      return entry.path === blockedPath || entry.path.startsWith(blockedPath + "/");
    });
    assert.equal(blocked, false, `${entry.path} está bloqueada por robots.txt pero es PUBLIC_INDEXABLE`);
  });
}

// ---------- 5. PUBLIC_NOINDEX: fuera de sitemap, Disallow según lo documentado ----------
const noindexEntries = PSCG_REGISTRY.filter((e) => e.category === PSCG_CATEGORY.PUBLIC_NOINDEX);

for (const entry of noindexEntries) {
  test(`PUBLIC_NOINDEX ${entry.path}: fuera de sitemap.xml`, () => {
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https://rifex\\.pro${entry.path}</loc>`));
  });

  test(`PUBLIC_NOINDEX ${entry.path}: robotsDisallow documentado coincide con robots.txt real`, () => {
    const isDisallowed = robots.includes(`Disallow: ${entry.path}`);
    assert.equal(
      isDisallowed,
      !!entry.robotsDisallow,
      `robotsDisallow declarado (${entry.robotsDisallow}) no coincide con robots.txt real (${isDisallowed}) para ${entry.path}`
    );
  });
}

// ---------- 6. LEGACY_REMOVED ----------
const legacyEntries = PSCG_REGISTRY.filter((e) => e.category === PSCG_CATEGORY.LEGACY_REMOVED);

test("PSCG: /rifas está clasificado como LEGACY_REMOVED", () => {
  const rifas = findPscgEntry("/rifas");
  assert.ok(rifas);
  assert.equal(rifas.category, PSCG_CATEGORY.LEGACY_REMOVED);
});

for (const entry of legacyEntries) {
  test(`LEGACY_REMOVED ${entry.path}: fuera de sitemap.xml, redirect real server-side presente`, () => {
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https://rifex\\.pro${entry.path}</loc>`));
    const src = read(entry.file);
    assert.match(src, /export async function getServerSideProps/);
    assert.match(src, /redirect:/);
  });
}

// ---------- 7. ninguna ruta nueva sin clasificación (alcance: esta misión) ----------
test("PSCG: /difusion (nueva en esta misión) está clasificada explícitamente", () => {
  const entry = findPscgEntry("/difusion");
  assert.ok(entry, "/difusion debe existir en PSCG_REGISTRY");
  assert.equal(entry.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
  assert.equal(entry.boundary, PSCG_BOUNDARY.SSR_REDIRECT);
});

// ---------- 8. /difusion = PRIVATE_AUTHENTICATED (requisito explícito de la misión) ----------
test("PSCG: /difusion = PRIVATE_AUTHENTICATED (requisito explícito)", () => {
  assert.equal(findPscgEntry("/difusion")?.category, PSCG_CATEGORY.PRIVATE_AUTHENTICATED);
});
