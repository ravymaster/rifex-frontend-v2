// tests/warpComercialNav.test.mjs
// Warp Conversacional descubrible desde la navegación pública de Rifex:
// menú superior (escritorio y móvil usan la misma lista navItems), pie
// «Soluciones» y tarjeta del catálogo de la portada. Sin sesión.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout = fs.readFileSync('src/components/Layout.jsx', 'utf8');
const home = fs.readFileSync('src/pages/index.js', 'utf8');

test('NAV 1: menú superior público incluye Warp Conversacional después de Medidor QR', () => {
  const block = layout.match(/const navItems = \[[\s\S]*?\];/)[0];
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Eventos', 'Campañas', 'Inscripciones', 'Medidor QR', 'Warp Conversacional']);
  assert.match(block, /\{ label: 'Warp Conversacional', href: '\/warp-conversacional' \}/);
});

test('NAV 2: pie «Soluciones» enlaza a Warp Conversacional sin requerir sesión', () => {
  assert.match(layout, /<Link href="\/medidor-qr">Cómo funciona Medidor QR<\/Link>\n\s*<Link href="\/warp-conversacional">Cómo funciona Warp Conversacional<\/Link>/);
  assert.doesNotMatch(layout, /\{user && <Link href="\/warp-conversacional"/);
});

test('NAV 3: la tarjeta del catálogo sigue en la portada con su CTA', () => {
  assert.match(home, /href: '\/warp-conversacional'/);
  assert.match(home, /cta: 'Ver demostración'/);
});
