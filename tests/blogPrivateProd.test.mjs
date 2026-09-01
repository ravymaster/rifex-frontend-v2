// RIFEX BLOG PRIVATE PROD PROMOTION — certifica por inspección estática del
// código fuente (sin servidor, sin red) que el Blog dejó de ser superficie
// pública en PROD: sin footer/nav link, noindex/nofollow/noarchive en las 4
// páginas, APIs de lectura protegidas contra acceso anónimo, redirect a
// login cuando no hay sesión, y que nada del feature fue eliminado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd());
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

test("footer no enlaza /blog", () => {
  const src = read("src/components/Layout.jsx");
  assert.doesNotMatch(src, /href=["']\/blog["']/);
});

test("navegación autenticada (accountItems) no incluye /blog", () => {
  const src = read("src/components/Layout.jsx");
  const match = src.match(/const accountItems = \[[\s\S]*?\];/);
  assert.ok(match, "no se encontró el bloque accountItems");
  assert.doesNotMatch(match[0], /\/blog/);
});

for (const page of ["src/pages/blog/index.js", "src/pages/blog/[slug].js", "src/pages/blog/compartir.js", "src/pages/blog/nueva.js"]) {
  test(`${page}: robots exacto noindex,nofollow,noarchive`, () => {
    const src = read(page);
    assert.match(src, /noindex,\s*nofollow,\s*noarchive/);
  });
}

for (const page of ["src/pages/blog/index.js", "src/pages/blog/[slug].js", "src/pages/blog/compartir.js", "src/pages/blog/nueva.js"]) {
  test(`${page}: redirige a /login si no hay sesión`, () => {
    const src = read(page);
    assert.match(src, /router\.push\([`'"]\/login\?next=/);
  });
}

for (const api of ["src/pages/api/blog/index.js", "src/pages/api/blog/[slug]/index.js"]) {
  test(`${api}: exige Bearer auth (contenido ya no es público)`, () => {
    const src = read(api);
    assert.match(src, /missing_auth/);
    assert.match(src, /getUser\(token\)/);
  });
}

test("funcionalidad Blog no fue eliminada — páginas y APIs siguen existiendo", () => {
  for (const p of [
    "src/pages/blog/index.js",
    "src/pages/blog/[slug].js",
    "src/pages/blog/compartir.js",
    "src/pages/blog/nueva.js",
    "src/pages/api/blog/index.js",
    "src/pages/api/blog/[slug]/index.js",
    "src/pages/api/blog/admin.js",
    "src/pages/api/blog/historia.js",
    "src/pages/api/blog/subscribe.js",
    "src/pages/api/blog/[slug]/comments.js",
    "src/pages/api/blog/[slug]/react.js",
  ]) {
    assert.ok(exists(p), `falta ${p} — Blog no debe eliminarse, solo dejar de ser público`);
  }
});

test("sitemap.xml no existe en PROD todavía — verificación de exclusión N/A (no hay sitemap que pueda listar /blog)", () => {
  assert.equal(exists("public/sitemap.xml"), false);
});
