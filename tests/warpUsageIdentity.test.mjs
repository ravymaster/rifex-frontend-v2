// tests/warpUsageIdentity.test.mjs
// Assistant 0.7.6 en Rifex: identidad seudónima de uso (x-warp-client-ref).
// Sin IA ni red: Warp se simula con un fetch falso y se usan los handlers
// reales del paquete a través del adaptador de Rifex (createPilotPostRoute).
//
// La referencia es una identidad de RED (IP pública + día UTC + sitio), no de
// una persona: quienes comparten IP pública comparten referencia y límite.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createWarpChatRouteHandler, createWarpReadActionRouteHandler } from '@warp-ai/assistant';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';
process.env.RIFEX_RATE_LIMIT_KEY_SECRET ||= 'secreto-de-prueba-del-limitador-'.padEnd(64, 'x');
const { createPilotPostRoute, readPilotConfig, assistantStatus, trustedClientIp, USAGE_IDENTITY_MIN_SECRET } = await import('../src/lib/warp/assistantPilot.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Valores ficticios generados en cada ejecución (nunca los reales).
const SECRET = crypto.randomBytes(32).toString('hex');
const SITE_KEY = `prueba-${crypto.randomBytes(8).toString('hex')}`;
const IP_A = '198.51.100.23';
const IP_B = '203.0.113.77';
const DAY1_NOON = Date.parse('2026-11-18T12:00:00Z');

const allowedKeys = [];
const allow = async (key) => { allowedKeys.push(key); return { allowed: true, retryAfterSeconds: 1 }; };

function env(extra = {}) {
  return { WARP_AI_API_URL: 'https://warp.example', WARP_AI_API_KEY: SITE_KEY, WARP_USAGE_IDENTITY_SECRET: SECRET, ...extra };
}

// Ruta real de Rifex con el handler real del paquete y Warp falso.
function makeRoute(factory, { envVars = env(), clock = () => DAY1_NOON } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return Response.json({ conversationId: 'c1', message: 'ok' }); };
  const readConfig = () => {
    const cfg = readPilotConfig(envVars);
    return cfg && { ...cfg, usageIdentity: { ...cfg.usageIdentity, clock } };
  };
  const route = createPilotPostRoute((cfg) => factory({ ...cfg, fetchImpl }), {}, { rateLimit: allow, enabled: () => true, readConfig });
  return { route, calls };
}

function fakeReq(body, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json', ...headers };
  return req;
}
function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (b) => { r.body = JSON.stringify(b); return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
async function send(route, body, headers) {
  const res = fakeRes();
  await route(fakeReq(body, headers), res);
  return res;
}
const chatBody = (conversationId) => ({ message: 'hola', ...(conversationId ? { conversationId } : {}) });
const actionBody = { conversationId: 'c1', actionId: 'a1' };
const refOf = (call) => call?.init?.headers?.['x-warp-client-ref'];

// Cálculo independiente (especificación de la entrega): primeros 24 bytes de
// HMAC-SHA256(secreto, "warp-usage-ref:v1|<día UTC>|<clave del sitio>|<IP>") en base64url.
function expectedRef(ip, day = '2026-11-18', key = SITE_KEY, secret = SECRET) {
  const mac = crypto.createHmac('sha256', secret).update(`warp-usage-ref:v1|${day}|${key}|${ip}`).digest();
  return mac.subarray(0, 24).toString('base64url');
}

test('IDENTIDAD 1: misma IP en chat y en acciones → misma referencia (32 caracteres, la de la especificación)', async () => {
  const chat = makeRoute(createWarpChatRouteHandler);
  const actions = makeRoute(createWarpReadActionRouteHandler);
  const r1 = await send(chat.route, chatBody('c1'), { 'x-real-ip': IP_A });
  const r2 = await send(actions.route, actionBody, { 'x-real-ip': IP_A });
  assert.equal(r1.statusCode, 200);
  assert.equal(chat.calls.length, 1);
  assert.equal(chat.calls[0].url, 'https://warp.example/api/v1/chat');
  assert.match(refOf(chat.calls[0]), /^[A-Za-z0-9_-]{32}$/);
  assert.equal(refOf(chat.calls[0]), expectedRef(IP_A));
  assert.equal(r2.statusCode, 200);
  assert.equal(actions.calls.length, 1);
  assert.equal(actions.calls[0].url, 'https://warp.example/api/v1/chat/actions');
  assert.equal(refOf(actions.calls[0]), refOf(chat.calls[0]));
  // Ambas rutas usan el mismo adaptador y la misma configuración.
  for (const p of ['src/pages/api/warp/chat/index.js', 'src/pages/api/warp/chat/actions.js']) {
    assert.match(read(p), /createPilotPostRoute\(/, p);
    assert.doesNotMatch(read(p), /usageIdentity|WARP_USAGE_IDENTITY_SECRET|x-real-ip/, p);
  }
});

test('IDENTIDAD 2: misma IP y conversación nueva durante el día → misma referencia', async () => {
  let now = Date.parse('2026-11-18T00:00:01Z');
  const { route, calls } = makeRoute(createWarpChatRouteHandler, { clock: () => now });
  await send(route, chatBody('conv-1'), { 'x-real-ip': IP_A });
  now = Date.parse('2026-11-18T13:30:00Z');
  await send(route, chatBody('conv-2'), { 'x-real-ip': IP_A, cookie: 'otra-sesion=1', 'user-agent': 'OtroNavegador/2' });
  now = Date.parse('2026-11-18T23:59:59Z');
  await send(route, chatBody(), { 'x-real-ip': IP_A });
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map(refOf)).size, 1);
});

test('IDENTIDAD 3: IP distinta → referencia distinta', async () => {
  const { route, calls } = makeRoute(createWarpChatRouteHandler);
  await send(route, chatBody('c1'), { 'x-real-ip': IP_A });
  await send(route, chatBody('c1'), { 'x-real-ip': IP_B });
  assert.notEqual(refOf(calls[0]), refOf(calls[1]));
  assert.equal(refOf(calls[1]), expectedRef(IP_B));
});

test('IDENTIDAD 4: sitio distinto (otra clave de sitio) → referencia distinta para la misma IP', async () => {
  const a = makeRoute(createWarpChatRouteHandler);
  const b = makeRoute(createWarpChatRouteHandler, { envVars: env({ WARP_AI_API_KEY: `${SITE_KEY}-otro-sitio` }) });
  await send(a.route, chatBody('c1'), { 'x-real-ip': IP_A });
  await send(b.route, chatBody('c1'), { 'x-real-ip': IP_A });
  assert.notEqual(refOf(a.calls[0]), refOf(b.calls[0]));
});

test('IDENTIDAD 5: secreto ausente, vacío o corto → 503 controlado, botón oculto y sin llamar a Warp', async () => {
  for (const bad of [undefined, '', '   ', 'x'.repeat(USAGE_IDENTITY_MIN_SECRET - 1)]) {
    const envVars = env({ WARP_USAGE_IDENTITY_SECRET: bad });
    const { route, calls } = makeRoute(createWarpChatRouteHandler, { envVars });
    const res = await send(route, chatBody('c1'), { 'x-real-ip': IP_A });
    assert.equal(res.statusCode, 503, String(bad));
    assert.match(res.body, /ASSISTANT_NOT_CONFIGURED/);
    assert.equal(calls.length, 0);
    assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => readPilotConfig(envVars) }), { enabled: false });
  }
  assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => readPilotConfig(env()) }), { enabled: true });
  // Si el paquete rechaza la configuración al crear el handler: 503, nunca 500.
  const throwing = createPilotPostRoute(() => { throw new Error('config inválida'); }, {}, { rateLimit: allow, enabled: () => true, readConfig: () => readPilotConfig(env()) });
  const res = await send(throwing, chatBody('c1'), { 'x-real-ip': IP_A });
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /ASSISTANT_NOT_CONFIGURED/);
  // Y con el paquete real: trustedProxy desconocido lanza → 503.
  const real = createPilotPostRoute(createWarpChatRouteHandler, {}, { rateLimit: allow, enabled: () => true, readConfig: () => ({ ...readPilotConfig(env()), usageIdentity: { secret: SECRET, trustedProxy: 'otro', required: true } }) });
  assert.equal((await send(real, chatBody('c1'), { 'x-real-ip': IP_A })).statusCode, 503);
});

test('IDENTIDAD 6: sin IP confiable (ausente o mal formada) → 503 y sin llamar a Warp', async () => {
  const { route, calls } = makeRoute(createWarpChatRouteHandler);
  for (const headers of [{}, { 'x-real-ip': '' }, { 'x-real-ip': 'no-es-ip' }, { 'x-real-ip': '1.2.3.4; DROP' }, { 'x-forwarded-for': IP_A }]) {
    const res = await send(route, chatBody('c1'), headers);
    assert.equal(res.statusCode, 503, JSON.stringify(headers));
    assert.match(res.body, /ASSISTANT_NOT_CONFIGURED/);
  }
  assert.equal(calls.length, 0);
  assert.equal(trustedClientIp({ headers: { 'x-real-ip': ` ${IP_A} ` } }), IP_A);
  assert.equal(trustedClientIp({ headers: { 'x-real-ip': [IP_B, IP_A] } }), IP_B);
  assert.equal(trustedClientIp({ headers: { 'x-real-ip': '2001:db8::1' } }), '2001:db8::1');
  assert.equal(trustedClientIp({ headers: { 'x-forwarded-for': IP_A } }), null);
});

test('IDENTIDAD 7: el navegador no puede elegir la referencia (x-warp-client-ref, x-forwarded-for ni el cuerpo)', async () => {
  const { route, calls } = makeRoute(createWarpChatRouteHandler);
  await send(route, chatBody('c1'), { 'x-real-ip': IP_A });
  await send(route, { ...chatBody('c1'), clientRef: 'elegida', 'x-warp-client-ref': 'elegida' }, {
    'x-real-ip': IP_A,
    'x-warp-client-ref': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'x-forwarded-for': IP_B,
    forwarded: `for=${IP_B}`,
    'cf-connecting-ip': IP_B,
  });
  assert.equal(calls.length, 2);
  assert.equal(refOf(calls[1]), refOf(calls[0]));
  assert.notEqual(refOf(calls[1]), 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  assert.deepEqual(JSON.parse(calls[1].init.body), { message: 'hola', conversationId: 'c1' });
});

test('IDENTIDAD 8: ni la IP ni la referencia aparecen en logs, en la respuesta al navegador ni en lo que guarda Rifex', async () => {
  const logged = [];
  const orig = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) { orig[k] = console[k]; console[k] = (...a) => logged.push(a.map(String).join(' ')); }
  allowedKeys.length = 0;
  let res;
  let calls;
  try {
    const route = makeRoute(createWarpChatRouteHandler);
    calls = route.calls;
    res = await send(route.route, chatBody('c1'), { 'x-real-ip': IP_A, cookie: 'sb-access-token=secreto', 'user-agent': 'NavegadorPrueba/1.0' });
  } finally {
    for (const k of Object.keys(orig)) console[k] = orig[k];
  }
  const ref = refOf(calls[0]);
  assert.ok(ref);
  const logs = logged.join('\n');
  for (const v of [IP_A, ref, SECRET]) assert.ok(!logs.includes(v), 'logs sin IP, referencia ni secreto');
  for (const v of [ref, SECRET, SITE_KEY, IP_A]) assert.ok(!String(res.body).includes(v), 'respuesta sin referencia, secreto, clave ni IP');
  for (const h of Object.values(res.headers)) for (const v of [ref, IP_A]) assert.ok(!String(h).includes(v));
  // Lo que sale hacia Warp: sin IP, cookies ni User-Agent; cuerpo cerrado.
  const out = JSON.stringify(calls[0].init);
  for (const v of [IP_A, 'secreto', 'NavegadorPrueba', SECRET]) assert.ok(!out.includes(v), v);
  // Rifex no guarda la referencia: el limitador propio recibe su clave por IP
  // (comportamiento previo, sin cambios), nunca la referencia ni el secreto.
  assert.ok(allowedKeys.length >= 1);
  for (const k of allowedKeys) { assert.ok(!k.includes(ref)); assert.ok(!k.includes(SECRET)); }
  // El adaptador no tiene logs.
  assert.doesNotMatch(read('src/lib/warp/assistantPilot.js').replace(/^\s*\/\/.*$/gm, ''), /console\./);
});

test('IDENTIDAD 9: la referencia rota al cambiar el día UTC', async () => {
  let now = Date.parse('2026-11-18T23:59:59.900Z');
  const { route, calls } = makeRoute(createWarpChatRouteHandler, { clock: () => now });
  await send(route, chatBody('c1'), { 'x-real-ip': IP_A });
  now = Date.parse('2026-11-19T00:00:00.100Z');
  await send(route, chatBody('c1'), { 'x-real-ip': IP_A });
  assert.notEqual(refOf(calls[0]), refOf(calls[1]));
  assert.equal(refOf(calls[0]), expectedRef(IP_A, '2026-11-18'));
  assert.equal(refOf(calls[1]), expectedRef(IP_A, '2026-11-19'));
  // Chile (UTC-3): a las 21:00 locales ya es otro día UTC.
  now = Date.parse('2026-11-19T20:59:00-03:00');
  await send(route, chatBody('c1'), { 'x-real-ip': IP_A });
  assert.equal(refOf(calls[2]), expectedRef(IP_A, '2026-11-19'));
});

test('IDENTIDAD 10: rollback a 0.7.5 — el paquete anterior está conservado, verificado y funciona con la misma configuración (sin referencia)', async () => {
  const tgz = path.join(ROOT, 'vendor/warp-sdk-lite/warp-ai-assistant-0.7.5-80db790.tgz');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(tgz)).digest('hex'), 'e742afd79a1ee55e91b9b19173208dfd8c238eb51eaa86072cec9a00be62e692');
  assert.match(read('vendor/warp-sdk-lite/SHA256SUMS.assistant-0.7.5'), /e742afd79a1ee55e91b9b19173208dfd8c238eb51eaa86072cec9a00be62e692/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rifex-rollback-075-'));
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', dir]);
    const v075 = await import(path.join(dir, 'package/src/serverRouteHandler.js'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package/package.json'), 'utf8')).version, '0.7.5');
    const { route, calls } = makeRoute(v075.createWarpChatRouteHandler);
    const res = await send(route, chatBody('c1'), { 'x-real-ip': IP_A });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ['authorization', 'content-type']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('IDENTIDAD 11: el secreto solo se lee en el servidor, en un único lugar', () => {
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name) && read(p).includes('WARP_USAGE_IDENTITY_SECRET')) offenders.push(p);
    }
  };
  walk('src');
  assert.deepEqual(offenders, ['src/lib/warp/assistantPilot.js']);
  assert.doesNotMatch(read('src/lib/warp/assistantPilot.js'), /NEXT_PUBLIC_[A-Z_]*USAGE/);
});
