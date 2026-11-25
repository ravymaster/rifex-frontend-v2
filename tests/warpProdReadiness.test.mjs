// tests/warpProdReadiness.test.mjs
// Warp en Rifex PROD: controles propios de producción, sin IA ni red.
//   - Ningún código de Warp apunta a DEV, a Railway ni a una URL privada.
//   - La key y la URL de Warp solo se leen en el servidor.
//   - No hay página piloto ni banner de DEV.
//   - El asistente queda apagado si el servidor no lo enciende.
//   - Solo capacidades de lectura, sin efectos ni confirmaciones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';

const ROOT = process.cwd();
const WARP_DIRS = ['src/lib/warp', 'src/components/warp', 'src/pages/api/warp', 'src/pages/api/v1'];
function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(js|jsx|mjs|json)$/.test(e.name)) out.push(p);
  }
  return out;
}
const code = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const ALL = WARP_DIRS.flatMap(files);

test('PROD 1: ningún archivo de Warp apunta a DEV, Railway ni URLs privadas (fuera de comentarios)', () => {
  assert.ok(ALL.length >= 15, `archivos: ${ALL.length}`);
  for (const p of ALL) {
    const src = code(p);
    assert.doesNotMatch(src, /rifex-frontend-main|vercel\.app|railway|localhost:\d/i, p);
  }
});

test('PROD 2: la key y la URL de Warp solo se leen en el servidor, nunca en NEXT_PUBLIC_* ni en el cliente', () => {
  for (const p of ALL) assert.doesNotMatch(code(p), /NEXT_PUBLIC_[A-Z_]*WARP/, p);
  const client = ['src/components/warp/WarpAssistantGlobal.jsx', 'src/lib/warp/assistantGlobal.js', 'src/lib/warp/pageContexts.js', 'src/lib/warp/pilotLinks.js', 'src/pages/_app.js'];
  for (const p of client) assert.doesNotMatch(code(p), /WARP_AI_API_KEY|WARP_AI_API_URL|SUPABASE_SERVICE_ROLE_KEY|service_role/, p);
  assert.match(code('src/lib/warp/assistantPilot.js'), /WARP_AI_API_KEY/);
});

test('PROD 3: sin página piloto ni banner de DEV; el botón global se monta una sola vez', () => {
  for (const p of ['src/pages/piloto-warp.js', 'src/components/warp/WarpAssistantPilot.jsx', 'src/components/DevBanner.jsx']) {
    assert.equal(fs.existsSync(path.join(ROOT, p)), false, p);
  }
  const app = code('src/pages/_app.js');
  assert.equal((app.match(/<WarpAssistantGlobal \/>/g) || []).length, 1);
  assert.doesNotMatch(app, /DevBanner|isDevStage/);
});

test('PROD 4: apagado por defecto — sin RIFEX_WARP_PILOT=on y configuración de servidor, el botón no aparece', async () => {
  const { assistantStatus } = await import('../src/lib/warp/assistantPilot.js');
  const rl = () => 'r'.repeat(64);
  assert.deepEqual(assistantStatus({ enabled: () => false, readConfig: () => ({ apiUrl: 'x', apiKey: 'y' }), readRateLimitSecret: rl }), { enabled: false });
  assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => null, readRateLimitSecret: rl }), { enabled: false });
  assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => ({ apiUrl: 'x', apiKey: 'y' }), readRateLimitSecret: () => null }), { enabled: false });
  assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => ({ apiUrl: 'x', apiKey: 'y' }), readRateLimitSecret: rl }), { enabled: true });
});

test('PROD 4b: variables de PROD — sin activación 404; sin cualquiera de los dos secretos, botón oculto y 503 sin guardar nada', async () => {
  const { assistantStatus, createPilotPostRoute, readPilotConfig, readRateLimitKeySecret, isWarpPilotEnabled } = await import('../src/lib/warp/assistantPilot.js');
  // Valores ficticios, solo de prueba.
  const full = {
    RIFEX_WARP_PILOT: 'on', WARP_AI_API_URL: 'https://warp.invalid', WARP_AI_API_KEY: 'clave-ficticia',
    WARP_USAGE_IDENTITY_SECRET: 'i'.repeat(64), RIFEX_RATE_LIMIT_KEY_SECRET: 'h'.repeat(64),
  };
  const status = (env) => assistantStatus({ enabled: () => isWarpPilotEnabled(env), readConfig: () => readPilotConfig(env), readRateLimitSecret: () => readRateLimitKeySecret(env) });
  assert.deepEqual(status(full), { enabled: true });
  const cases = {
    'sin RIFEX_WARP_PILOT': { RIFEX_WARP_PILOT: undefined },
    'sin WARP_AI_API_URL': { WARP_AI_API_URL: undefined },
    'sin WARP_AI_API_KEY': { WARP_AI_API_KEY: undefined },
    'sin WARP_USAGE_IDENTITY_SECRET': { WARP_USAGE_IDENTITY_SECRET: undefined },
    'sin RIFEX_RATE_LIMIT_KEY_SECRET': { RIFEX_RATE_LIMIT_KEY_SECRET: undefined },
    'secretos iguales': { RIFEX_RATE_LIMIT_KEY_SECRET: 'i'.repeat(64) },
    'secreto de identidad corto': { WARP_USAGE_IDENTITY_SECRET: 'i'.repeat(31) },
    'secreto del limitador corto': { RIFEX_RATE_LIMIT_KEY_SECRET: 'h'.repeat(31) },
  };
  for (const [name, patch] of Object.entries(cases)) {
    const env = { ...full, ...patch };
    assert.deepEqual(status(env), { enabled: false }, name);
    let saved = 0;
    let created = 0;
    const route = createPilotPostRoute(() => { created += 1; return async () => {}; }, {}, {
      enabled: () => isWarpPilotEnabled(env), readConfig: () => readPilotConfig(env), readRateLimitSecret: () => readRateLimitKeySecret(env),
      rateLimit: async () => { saved += 1; return { allowed: true }; },
    });
    const res = { code: 0, setHeader() {}, status(c) { this.code = c; return this; }, json() { return this; }, end() { return this; } };
    await route({ method: 'POST', headers: { 'x-real-ip': '203.0.113.7', 'content-type': 'application/json' } }, res);
    assert.equal(res.code, name === 'sin RIFEX_WARP_PILOT' ? 404 : 503, name);
    assert.equal(saved, 0, `${name}: nada guardado en el limitador`);
    assert.equal(created, 0, `${name}: no se crea el handler de Warp`);
  }
});

test('PROD 5: solo enlaces a https://rifex.pro; DEV queda como texto', async () => {
  const { PILOT_LINK_POLICY } = await import('../src/lib/warp/pilotLinks.js');
  assert.deepEqual(PILOT_LINK_POLICY, { internalHosts: ['rifex.pro'], allowedHosts: ['rifex.pro'] });
  const { publicOrigin, CANONICAL_ORIGIN } = await import('../src/lib/warp/publicOrigin.js');
  assert.equal(CANONICAL_ORIGIN, 'https://rifex.pro');
  assert.equal(publicOrigin(undefined), 'https://rifex.pro');
  assert.equal(publicOrigin('https://rifex.pro'), 'https://rifex.pro');
});

test('PROD 6: todas las capacidades son de lectura, públicas, sin efectos ni confirmación', async () => {
  const { createRifexConnector } = await import('../src/lib/warp/rifexConnector.js');
  const m = createRifexConnector().getManifest();
  for (const c of m.capabilities) {
    assert.deepEqual([c.operationType, c.sideEffects, c.confirmationRequired, c.authentication, c.invocation.method], ['read', false, false, 'public', 'GET'], c.id);
  }
  assert.ok(!m.capabilities.some((c) => /refund|reembols|devoluc|create|update|delete|pay|order|admin|raffle|rifa/i.test(c.id)));
});
