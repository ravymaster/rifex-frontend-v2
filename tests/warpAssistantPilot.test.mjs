// tests/warpAssistantPilot.test.mjs
// Piloto local del asistente de Warp: habilitación por variable privada,
// key solo en el servidor, adaptador de Pages Router y errores controlados.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { createWarpChatRouteHandler } from '@warp-ai/assistant';
// El módulo carga el limitador de Rifex (crea su cliente al importarse): valores ficticios, sin red.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';
const { createPilotPostRoute, isWarpPilotEnabled, readPilotConfig, MAX_PILOT_BODY_BYTES, PILOT_RATE_LIMIT_MAX } = await import('../src/lib/warp/assistantPilot.js');
const allow = async () => ({ allowed: true, retryAfterSeconds: 1 });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Key ficticia de prueba en un archivo temporal (nunca la real).
const FAKE_KEY = `prueba-${Math.random().toString(36).slice(2)}-clave`;
const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rifex-pilot-'));
const keyFile = path.join(keyDir, 'site-key.txt');
fs.writeFileSync(keyFile, `${FAKE_KEY}\n`, { mode: 0o600 });

function fakeReq(method, body = '', headers = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.headers = { 'content-type': 'application/json', ...headers };
  return req;
}
function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: undefined, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (b) => { r.body = JSON.stringify(b); return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}

test('PILOTO 1: solo existe con RIFEX_WARP_PILOT=on exacto', () => {
  assert.equal(isWarpPilotEnabled({}), false);
  assert.equal(isWarpPilotEnabled({ RIFEX_WARP_PILOT: 'ON' }), false);
  assert.equal(isWarpPilotEnabled({ RIFEX_WARP_PILOT: 'true' }), false);
  assert.equal(isWarpPilotEnabled({ RIFEX_WARP_PILOT: 'on' }), true);
});

test('PILOTO 2: la key se lee del archivo en el servidor; sin archivo o URL no hay configuración', () => {
  assert.deepEqual(readPilotConfig({ WARP_AI_API_URL: 'http://warp.test', WARP_AI_API_KEY_FILE: keyFile }), { apiUrl: 'http://warp.test', apiKey: FAKE_KEY });
  assert.equal(readPilotConfig({ WARP_AI_API_URL: 'http://warp.test' }), null);
  assert.equal(readPilotConfig({ WARP_AI_API_KEY_FILE: keyFile }), null);
  assert.equal(readPilotConfig({ WARP_AI_API_URL: 'http://warp.test', WARP_AI_API_KEY_FILE: path.join(keyDir, 'no-existe') }), null);
  // Vercel: sin archivo, la key sale de la variable privada del servidor.
  assert.deepEqual(readPilotConfig({ WARP_AI_API_URL: 'http://warp.test', WARP_AI_API_KEY: ` ${FAKE_KEY} ` }), { apiUrl: 'http://warp.test', apiKey: FAKE_KEY });
  // Si hay archivo, manda el archivo.
  assert.equal(readPilotConfig({ WARP_AI_API_URL: 'http://warp.test', WARP_AI_API_KEY_FILE: keyFile, WARP_AI_API_KEY: 'otra' }).apiKey, FAKE_KEY);
});

test('PILOTO 3: piloto apagado → 404 sin leer configuración', async () => {
  let reads = 0;
  const route = createPilotPostRoute(createWarpChatRouteHandler, {}, { rateLimit: allow, enabled: () => false, readConfig: () => { reads += 1; return null; } });
  const res = fakeRes();
  await route(fakeReq('POST', '{"message":"hola"}'), res);
  assert.equal(res.statusCode, 404);
  assert.equal(reads, 0);
});

test('PILOTO 4: solo POST; sin configuración 503; cuerpo excesivo 413', async () => {
  const on = () => true;
  const r405 = fakeRes();
  await createPilotPostRoute(createWarpChatRouteHandler, {}, { rateLimit: allow, enabled: on, readConfig: () => null })(fakeReq('GET'), r405);
  assert.equal(r405.statusCode, 405);
  const r503 = fakeRes();
  await createPilotPostRoute(createWarpChatRouteHandler, {}, { rateLimit: allow, enabled: on, readConfig: () => null })(fakeReq('POST', '{}'), r503);
  assert.equal(r503.statusCode, 503);
  assert.match(r503.body, /ASSISTANT_NOT_CONFIGURED/);
  const r413 = fakeRes();
  const cfg = () => ({ apiUrl: 'http://127.0.0.1:9', apiKey: FAKE_KEY });
  await createPilotPostRoute(createWarpChatRouteHandler, {}, { rateLimit: allow, enabled: on, readConfig: cfg })(fakeReq('POST', 'x'.repeat(MAX_PILOT_BODY_BYTES + 10)), r413);
  assert.equal(r413.statusCode, 413);
});

test('PILOTO 5: con Warp apagado responde un error controlado, con cuerpo y sin la key', async () => {
  const route = createPilotPostRoute(createWarpChatRouteHandler, { timeoutMs: 2000 }, {
    rateLimit: allow,
    enabled: () => true,
    readConfig: () => ({ apiUrl: 'http://127.0.0.1:9', apiKey: FAKE_KEY }),
  });
  const res = fakeRes();
  await route(fakeReq('POST', JSON.stringify({ message: '¿Qué servicios ofrece Rifex?' })), res);
  assert.ok(res.statusCode >= 400 && res.statusCode < 600, String(res.statusCode));
  assert.ok(res.body && JSON.parse(res.body).error, 'error con cuerpo JSON');
  assert.ok(!String(res.body).includes(FAKE_KEY), 'la key nunca vuelve al navegador');
});

test('PILOTO 6: key solo en servidor; página y rutas aisladas del sitio', () => {
  const lib = read('src/lib/warp/assistantPilot.js');
  assert.doesNotMatch(lib, /console\./, 'sin logs');
  for (const p of ['src/components/warp/WarpAssistantPilot.jsx', 'src/pages/piloto-warp.js']) {
    const src = read(p);
    assert.doesNotMatch(src, /WARP_AI_API_KEY|site-key|apiKey/, p);
  }
  let hits = '';
  try {
    hits = fs.readFileSync(path.join(ROOT, 'src/components/Layout.jsx'), 'utf8') + read('src/pages/_app.js');
  } catch {}
  assert.doesNotMatch(hits, /WarpAssistant|@warp-ai\/assistant/, 'el widget no está en el layout global');
  assert.match(read('src/pages/piloto-warp.js'), /if \(!isWarpPilotEnabled\(\)\) return \{ notFound: true \};/);
  assert.match(read('src/pages/api/warp/chat/index.js'), /createPilotPostRoute\(createWarpChatRouteHandler/);
  assert.match(read('src/pages/api/warp/chat/actions.js'), /createPilotPostRoute\(createWarpReadActionRouteHandler, \{\}, \{ scope: 'actions' \}\)/);
});

test('PILOTO 7: límite de mensajes por IP antes de leer la key o llamar a Warp', async () => {
  assert.equal(PILOT_RATE_LIMIT_MAX, 20);
  let configReads = 0;
  const route = createPilotPostRoute(createWarpChatRouteHandler, {}, {
    enabled: () => true,
    rateLimit: async (key) => { assert.match(key, /^warp-pilot-chat:ip:/); return { allowed: false, retryAfterSeconds: 120 }; },
    readConfig: () => { configReads += 1; return null; },
  });
  const res = fakeRes();
  await route(Object.assign(fakeReq('POST', '{"message":"hola"}'), { socket: {} }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '120');
  assert.equal(configReads, 0);
  assert.match(read('src/pages/api/warp/chat/actions.js'), /scope: 'actions'/);
  assert.doesNotMatch(read('src/lib/warp/assistantPilot.js'), /NEXT_PUBLIC_[A-Z_]*WARP/);
});

test('PILOTO 8: enlaces del asistente — solo el dominio exacto de Rifex DEV es clicable', async () => {
  const { normalizeLinkPolicy, splitTextWithLinks } = await import('@warp-ai/assistant');
  const { PILOT_LINK_HOSTS, PILOT_LINK_POLICY } = await import('../src/lib/warp/pilotLinks.js');
  assert.deepEqual([...PILOT_LINK_HOSTS], ['rifex-frontend-main.vercel.app']);
  assert.deepEqual(PILOT_LINK_POLICY.internalHosts, ['rifex-frontend-main.vercel.app']);
  assert.deepEqual(PILOT_LINK_POLICY.allowedHosts, ['rifex-frontend-main.vercel.app']);
  assert.doesNotMatch(JSON.stringify(PILOT_LINK_POLICY), /\*/, 'sin comodines');
  const policy = normalizeLinkPolicy({ internalHosts: [...PILOT_LINK_POLICY.internalHosts], allowedHosts: [...PILOT_LINK_POLICY.allowedHosts] }, 'rifex-frontend-main.vercel.app');
  const links = (text) => splitTextWithLinks(text, policy).filter((s) => s.type === 'link');

  const ok = links('Mira https://rifex-frontend-main.vercel.app/eventos.');
  assert.equal(ok.length, 1);
  assert.equal(ok[0].href, 'https://rifex-frontend-main.vercel.app/eventos');
  assert.equal(ok[0].internal, true);
  assert.equal(ok[0].path, '/eventos');

  for (const text of [
    'https://example.com/eventos',
    'https://rifex.pro/eventos',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'file:///etc/passwd',
    'http://rifex-frontend-main.vercel.app/eventos',
    'https://rifex-frontend-main.vercel.app.evil.com/eventos',
    'https://rifex-frontend-maim.vercel.app/eventos',
    'https://rifex-frontend-main-vercel.app/eventos',
    'https://evil-rifex-frontend-main.vercel.app/eventos',
    'https://rifex-frontend-main.vercel.app@evil.com/eventos',
    'https://usuario:clave@rifex-frontend-main.vercel.app/eventos',
    'https://rіfex-frontend-main.vercel.app/eventos',
    'https://rifex-frontend-main.vercel.app:8443/eventos',
  ]) {
    assert.equal(links(text).length, 0, text);
    assert.equal(splitTextWithLinks(text, policy).map((s) => s.value).join(''), text, `${text} queda como texto`);
  }
});
