// tests/planesBadgeLayout.test.mjs
// Regresión: en /planes la insignia («Promoción de lanzamiento» / «Único
// modelo») se superponía al título largo de la comisión de lanzamiento en
// escritorio, porque usaba position:absolute. Debe quedar siempre en el flujo
// normal, en su propia fila, antes del título, en todos los anchos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/planes.module.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const page = readFileSync('src/pages/planes.js', 'utf8');

// Todas las reglas (también dentro de @media) cuyo selector incluye .badge.
function badgeRules(src) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    if (/\.badge\b/.test(m[1])) rules.push(m[2]);
  }
  return rules;
}

test('PLANES 1: la insignia nunca usa posicionamiento que la saque del flujo', () => {
  const rules = badgeRules(css);
  assert.ok(rules.length >= 1, 'debe existir la regla .badge');
  for (const body of rules) {
    assert.doesNotMatch(body, /position\s*:\s*(absolute|fixed|relative|sticky)/i, body);
    assert.doesNotMatch(body, /(^|;)\s*(top|right|left|bottom|inset)\s*:/i, body);
    assert.doesNotMatch(body, /float\s*:|transform\s*:|margin[a-z-]*\s*:\s*-/i, body);
  }
  // Ocupa su propia línea con separación respecto del título.
  assert.match(rules.join(';'), /display\s*:\s*inline-block/);
  assert.match(rules.join(';'), /margin\s*:\s*0 0 10px/);
});

test('PLANES 2: en la tarjeta la insignia va antes del título, como elemento propio', () => {
  const i = page.indexOf('<div className={styles.badge}>{commission.planBadge}</div>');
  const j = page.indexOf('<h2 className={styles.planName}>{commission.planName}</h2>');
  assert.ok(i > 0 && j > i, 'la insignia debe renderizarse antes del título');
  assert.doesNotMatch(page.slice(i, j), /style=\{\{[^}]*position/);
});
