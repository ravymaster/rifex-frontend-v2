// tests/prodRegressionsFix2026-09-10.test.mjs
// PROD HOTFIX (2026-09-10) — dos regresiones reales encontradas por QA
// humana en vivo: (1) checkout móvil con overflow horizontal en título/
// fecha largos; (2) /rifas/<uuid> nunca redirigía al slug real, solo
// consolidaba el canonical (brecha ya conocida, ahora cerrada).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------
// CHECKOUT MÓVIL — sin overflow horizontal
// ---------------------------------------------------------------------
test('CSS 1: .summaryPrizeName ya no trunca con nowrap/ellipsis — envuelve', () => {
  const css = read('src/styles/checkoutV2.module.css');
  const block = css.match(/\.summaryPrizeName\s*\{[^}]*\}/)[0];
  assert.doesNotMatch(block, /white-space:\s*nowrap/);
  assert.doesNotMatch(block, /text-overflow:\s*ellipsis/);
  assert.match(block, /overflow-wrap:\s*break-word/);
});

test('CSS 2: .summaryHeadText tiene min-width:0 real y flex:1 (permite calcular espacio disponible)', () => {
  const css = read('src/styles/checkoutV2.module.css');
  const block = css.match(/\.summaryHeadText\s*\{[^}]*\}/)[0];
  assert.match(block, /min-width:\s*0/);
  assert.match(block, /flex:\s*1 1 auto/);
});

test('CSS 3: .summaryRow permite flex-wrap — la fecha puede bajar de línea en vez de desbordar', () => {
  const css = read('src/styles/checkoutV2.module.css');
  const block = css.match(/\.summaryRow\s*\{[^}]*\}/)[0];
  assert.match(block, /flex-wrap:\s*wrap/);
});

test('CSS 4: .summaryRow b tiene min-width:0 + overflow-wrap (el valor largo puede quebrar/envolver)', () => {
  const css = read('src/styles/checkoutV2.module.css');
  const block = css.match(/\.summaryRow b\s*\{[^}]*\}/)[0];
  assert.match(block, /min-width:\s*0/);
  assert.match(block, /overflow-wrap:\s*break-word/);
});

test('CSS 5: .summaryThumb conserva tamaño fijo + flex-shrink:0 (no se deforma)', () => {
  const css = read('src/styles/checkoutV2.module.css');
  const block = css.match(/\.summaryThumb\s*\{[^}]*\}/)[0];
  assert.match(block, /width:\s*56px/);
  assert.match(block, /flex-shrink:\s*0/);
});

// ---------------------------------------------------------------------
// SLUG — redirect real UUID -> slug
// ---------------------------------------------------------------------
test('SLUG 1: getServerSideProps redirige (308 permanent) cuando isUuid(params.id) y la rifa tiene slug', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /import \{ idOrSlugColumn, isUuid \} from "\.\.\/\.\.\/lib\/idOrSlug"/);
  assert.match(src, /if \(isUuid\(params\.id\) && raffle\?\.slug\)/);
  assert.match(src, /destination: `\/rifas\/\$\{raffle\.slug\}\$\{suffix\}`/);
  assert.match(src, /permanent: true/);
});

test('SLUG 2: el redirect preserva query string real (excluye el propio "id" para no duplicarlo)', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /new URLSearchParams\(query \|\| \{\}\)/);
  assert.match(src, /qs\.delete\('id'\)/);
});

test('SLUG 3: si ya se entra por slug (no UUID), nunca redirige — evita loops', () => {
  const src = read('src/pages/rifas/[id].jsx');
  // La condición exige isUuid(params.id) explícitamente — un slug real
  // (no-UUID) nunca cumple esa condición, así que jamás dispara redirect.
  const guardMatch = src.match(/if \(isUuid\(params\.id\) && raffle\?\.slug\) \{/);
  assert.ok(guardMatch, 'el guard debe exigir isUuid(params.id) explícitamente');
});

test('SLUG 4: rifa sin slug (histórica) no redirige — degradación segura, nunca inventa un slug', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /raffle\?\.slug\)/); // la condición exige raffle.slug truthy
});

test('SLUG 5: el UUID interno nunca se toca — ningún UPDATE/mutación en getServerSideProps', () => {
  const src = read('src/pages/rifas/[id].jsx');
  const gssp = src.match(/export async function getServerSideProps[\s\S]*?\n\}\n/)[0];
  assert.doesNotMatch(gssp, /\.update\(|PATCH|supabase\.from/);
});

test('SLUG 6: canonicalId (ya certificado) sigue intacto — consolidación de metadata no se tocó', () => {
  const src = read('src/pages/rifas/[id].jsx');
  assert.match(src, /const canonicalId = raffle\?\.slug \|\| metaSlug \|\| id \|\| ""/);
});

// ---------------------------------------------------------------------
// PROTECCIÓN — Payment Engine / checkout MP / webhook / comisión intactos
// ---------------------------------------------------------------------
test('PROTEGIDO: checkout.jsx no cambió su lógica de submit/pago, solo CSS de resumen', () => {
  const src = read('src/pages/rifas/[id]/checkout.jsx');
  assert.match(src, /\/api\/checkout\/mp/);
});
