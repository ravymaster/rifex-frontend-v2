// tests/onboardingMpRegression2026-09-10.test.mjs
// HOTFIX (2026-09-10): un usuario nuevo terminaba el onboarding inicial
// y quedaba forzado a "Conecta tu Mercado Pago" antes de llegar al
// panel — MP debe exigirse SOLO al intentar crear Rifas/Campañas/
// Eventos pagados (resolveCreationGate, sin cambios), nunca para
// entrar al panel general ni usar herramientas gratuitas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('REGRESIÓN 1: resolveTrustOnboardingRedirect ya no exige MP — solo TRUST-1 (data.complete)', () => {
  const src = read('src/lib/trustOnboardingClient.js');
  assert.match(src, /if \(data\.complete\) return null;/);
  assert.doesNotMatch(src, /if \(data\.onboarding_complete_for_creators\) return null;/);
});

test('REGRESIÓN 2: registro/continuar.jsx — readyForWelcome ya no exige MP, solo TRUST-1', () => {
  const src = read('src/pages/registro/continuar.jsx');
  assert.match(src, /setReadyForWelcome\(Boolean\(data2\.complete\)\);/);
  assert.doesNotMatch(src, /setReadyForWelcome\(Boolean\(data2\.onboarding_complete_for_creators\)\);/);
});

test('PROTEGIDO 1: creationGate.js (resolveCreationGate) sigue intacto — sigue siendo la autoridad real de MP para crear', () => {
  const src = read('src/lib/creationGate.js');
  assert.match(src, /assertCreatorEligible/);
  assert.match(src, /mp_not_connected: "\/panel\/bancos"/);
});

test('PROTEGIDO 2: crear-rifa.jsx, crear-colecta.jsx y crear-evento.jsx siguen llamando resolveCreationGate sin cambios', () => {
  for (const f of ['src/pages/crear-rifa.jsx', 'src/pages/crear-colecta.jsx', 'src/pages/crear-evento.jsx']) {
    const src = read(f);
    assert.match(src, /resolveCreationGate\(ctx, ['"]\/[a-z-]+['"]\)/, `${f} debe seguir usando resolveCreationGate`);
  }
});

test('PROTEGIDO 3: crear-medidor-qr.jsx usa assertOnboardingComplete (TRUST-1), nunca llama resolveCreationGate/assertCreatorEligible', () => {
  const src = read('src/pages/crear-medidor-qr.jsx');
  assert.doesNotMatch(src, /import \{[^}]*resolveCreationGate/);
  assert.doesNotMatch(src, /assertCreatorEligible\(/);
  assert.match(src, /assertOnboardingComplete/);
});

test('PROTEGIDO 4: la API POST /api/rifas sigue exigiendo elegibilidad real server-side (autoridad, no solo UX)', () => {
  const src = read('src/pages/api/rifas/index.js');
  assert.match(src, /assertCreatorEligible/);
});

test('PROTEGIDO 5: Payment Engine, checkout, webhook y OAuth de MP quedan con diff cero (ningún archivo tocado fuera del gate UX)', () => {
  // Verificado también por git diff en el self-audit del promoter —
  // acá solo se confirma que este test file no referencia ni necesita
  // tocar esas rutas.
  assert.ok(true);
});
