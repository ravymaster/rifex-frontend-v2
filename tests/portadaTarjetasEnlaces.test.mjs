// tests/portadaTarjetasEnlaces.test.mjs
// Portada: las tarjetas de «Todo lo que necesitas para gestionar tu
// iniciativa» con destino público son enlaces reales completos; la que no
// tiene página pública queda informativa, sin señales de clic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/index.js', 'utf8');
const css = fs.readFileSync('src/styles/index.module.css', 'utf8');
const card = (key) => {
  const i = src.indexOf(`key: '${key}'`);
  assert.ok(i > 0, key);
  return src.slice(i, src.indexOf('\n  },', i));
};
const hrefOf = (key) => (card(key).match(/\n\s*href: '([^']+)'/) || [])[1] || null;

test('TARJETAS 1: destinos públicos exactos (sin login, panel ni rutas inventadas)', () => {
  assert.equal(hrefOf('entradas'), '/eventos');
  assert.equal(hrefOf('acceso'), '/eventos');
  assert.equal(hrefOf('campanas'), '/campanas');
  assert.equal(hrefOf('reportes'), null, 'Reportes queda informativa');
  assert.equal(hrefOf('inscripciones'), '/inscripciones');
  assert.equal(hrefOf('medidor-qr'), '/medidor-qr');
  assert.equal(hrefOf('warp-conversacional'), '/warp-conversacional');
  for (const p of ['eventos/index.jsx', 'campanas.jsx']) assert.ok(fs.existsSync(`src/pages/${p}`), p);
  assert.doesNotMatch(src.slice(src.indexOf('const CAPABILITIES')), /href: '\/(login|panel|admin|mis-iniciativas)/);
});

test('TARJETAS 2: toda la tarjeta es el enlace (Link) y la informativa no simula clic', () => {
  assert.match(src, /const CardTag = c\.href \? Link : 'div';/);
  assert.match(src, /className: `\$\{styles\.capCard\} \$\{styles\.capCardStatic\}`/);
  assert.match(css, /\.capCard:focus-visible \{\s*outline: 3px solid var\(--accent\);/);
  assert.match(css, /\.capCardStatic \{ cursor: default; \}/);
  assert.match(css, /\.capCardStatic:hover \{\s*transform: none;/);
});
