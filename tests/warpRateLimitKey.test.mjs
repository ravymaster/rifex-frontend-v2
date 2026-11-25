// tests/warpRateLimitKey.test.mjs
// Clave del limitador propio de Rifex para el asistente: referencia HMAC
// diaria (`warp-pilot-<scope>:h:<32 hex>`), nunca la IP en claro.
// Sin IA ni red: Warp se simula con un fetch falso y se usan los handlers
// reales del paquete a través del adaptador (createPilotPostRoute).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createWarpChatRouteHandler, createWarpReadActionRouteHandler } from '@warp-ai/assistant';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';
const {
  createPilotPostRoute, readPilotConfig, readRateLimitKeySecret, rateLimitRef, pilotRateLimitKey, assistantStatus,
  RATE_LIMIT_KEY_MIN_SECRET, PILOT_RATE_LIMIT_MAX, PILOT_RATE_LIMIT_WINDOW_SECONDS,
} = await import('../src/lib/warp/assistantPilot.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Valores ficticios generados en cada ejecución (nunca los reales).
const RL_SECRET = crypto.randomBytes(32).toString('hex');
const WARP_SECRET = crypto.randomBytes(32).toString('hex');
const SITE_KEY = `prueba-${crypto.randomBytes(8).toString('hex')}`;
const IP_A = '198.51.100.23';
const IP_B = '203.0.113.77';
const IP_V6 = '2001:db8::1';
const DAY1 = Date.parse('2026-11-18T12:00:00Z');
const DAY1_LATE = Date.parse('2026-11-18T23:59:59Z');
const DAY2 = Date.parse('2026-11-19T00:00:00Z');

function env(extra = {}) {
  return {
    WARP_AI_API_URL: 'https://warp.example', WARP_AI_API_KEY: SITE_KEY,
    WARP_USAGE_IDENTITY_SECRET: WARP_SECRET, RIFEX_RATE_LIMIT_KEY_SECRET: RL_SECRET, ...extra,
  };
}

// Cálculo independiente (especificación del GO).
function expectedKey(scope, ip, day = '2026-11-18', secret = RL_SECRET) {
  const hex = crypto.createHmac('sha256', secret).update(`rifex-rl:v1|${day}|warp-pilot|${ip}`).digest('hex').slice(0, 32);
  return `warp-pilot-${scope}:h:${hex}`;
}
function expectedWarpRef(ip, day = '2026-11-18') {
  return crypto.createHmac('sha256', WARP_SECRET).update(`warp-usage-ref:v1|${day}|${SITE_KEY}|${ip}`).digest().subarray(0, 24).toString('base64url');
}

// Ruta real con limitador en memoria (misma semántica que rate_limit_hit:
// contador por clave y ventana fija).
function makeRoute(factory, { envVars = env(), clock = () => DAY1, scope = 'chat', store = new Map() } = {}) {
  const calls = [];
  const keys = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return Response.json({ conversationId: 'c1', message: 'ok' }); };
  const rateLimit = async (key, max, windowSeconds) => {
    keys.push(key);
    const bucket = `${key}|${Math.floor(clock() / (windowSeconds * 1000))}`;
    const count = (store.get(bucket) || 0) + 1;
    store.set(bucket, count);
    return { allowed: count <= max, count, limit: max, retryAfterSeconds: 60 };
  };
  const readConfig = () => {
    const cfg = readPilotConfig(envVars);
    return cfg && { ...cfg, usageIdentity: { ...cfg.usageIdentity, clock } };
  };
  const route = createPilotPostRoute((cfg) => factory({ ...cfg, fetchImpl }), {}, {
    rateLimit, enabled: () => true, readConfig, readRateLimitSecret: () => readRateLimitKeySecret(envVars), scope, clock,
  });
  return { route, calls, keys, store };
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
const chatBody = { message: 'hola', conversationId: 'c1' };
const actionBody = { conversationId: 'c1', actionId: 'a1' };

test('LIMITADOR 1: la clave es warp-pilot-<scope>:h:<32 hex>, la de la especificación, y nunca contiene la IP', async () => {
  for (const ip of [IP_A, IP_B, IP_V6]) {
    const r = makeRoute(createWarpChatRouteHandler);
    const res = await send(r.route, chatBody, { 'x-real-ip': ip });
    assert.equal(res.statusCode, 200);
    assert.equal(r.keys.length, 1);
    assert.match(r.keys[0], /^warp-pilot-chat:h:[0-9a-f]{32}$/);
    assert.equal(r.keys[0], expectedKey('chat', ip));
    assert.ok(!r.keys[0].includes(ip), 'la IP nunca va en la clave');
    assert.ok(!r.keys[0].includes(':ip:'));
  }
  assert.equal(pilotRateLimitKey('chat', rateLimitRef(RL_SECRET, IP_A, DAY1)), expectedKey('chat', IP_A));
});

test('LIMITADOR 2: misma IP, mismo sitio y mismo día → misma clave (también entre conversaciones)', async () => {
  const r = makeRoute(createWarpChatRouteHandler, { clock: () => DAY1 });
  await send(r.route, { message: 'hola' }, { 'x-real-ip': IP_A });
  await send(r.route, { message: 'hola', conversationId: 'otra' }, { 'x-real-ip': IP_A });
  const late = makeRoute(createWarpChatRouteHandler, { clock: () => DAY1_LATE });
  await send(late.route, chatBody, { 'x-real-ip': IP_A });
  assert.equal(new Set([...r.keys, ...late.keys]).size, 1);
});

test('LIMITADOR 3: día UTC distinto, IP distinta o secreto distinto → clave distinta', () => {
  const base = rateLimitRef(RL_SECRET, IP_A, DAY1);
  assert.notEqual(rateLimitRef(RL_SECRET, IP_A, DAY2), base, 'rota a las 00:00 UTC');
  assert.equal(pilotRateLimitKey('chat', rateLimitRef(RL_SECRET, IP_A, DAY2)), expectedKey('chat', IP_A, '2026-11-19'));
  assert.notEqual(rateLimitRef(RL_SECRET, IP_B, DAY1), base);
  assert.notEqual(rateLimitRef(crypto.randomBytes(32).toString('hex'), IP_A, DAY1), base);
  // La clave del sitio de Warp no entra en el cálculo: otro sitio con el
  // mismo secreto del limitador compartiría clave, por eso PROD usa otro secreto.
  assert.match(read('src/lib/warp/assistantPilot.js'), /rifex-rl:v1/);
});

test('LIMITADOR 4: chat y acciones conservan scopes separados (20 por 10 min cada uno) con la misma referencia', async () => {
  assert.equal(PILOT_RATE_LIMIT_MAX, 20);
  assert.equal(PILOT_RATE_LIMIT_WINDOW_SECONDS, 600);
  const store = new Map();
  const chat = makeRoute(createWarpChatRouteHandler, { store });
  const actions = makeRoute(createWarpReadActionRouteHandler, { scope: 'actions', store });
  for (let i = 0; i < PILOT_RATE_LIMIT_MAX; i += 1) assert.equal((await send(chat.route, chatBody, { 'x-real-ip': IP_A })).statusCode, 200);
  const blocked = await send(chat.route, chatBody, { 'x-real-ip': IP_A });
  assert.equal(blocked.statusCode, 429);
  assert.equal(chat.calls.length, PILOT_RATE_LIMIT_MAX, 'el 21.º no llega a Warp');
  const act = await send(actions.route, actionBody, { 'x-real-ip': IP_A });
  assert.equal(act.statusCode, 200, 'acciones tiene su propio cupo en Rifex');
  assert.equal(actions.keys[0], expectedKey('actions', IP_A));
  assert.equal(chat.keys[0].split(':h:')[1], actions.keys[0].split(':h:')[1]);
  assert.equal(read('src/pages/api/warp/chat/actions.js').includes("scope: 'actions'"), true);
});

test('LIMITADOR 5: la clave del limitador nunca coincide con la referencia enviada a Warp; chat y acciones comparten la de Warp', async () => {
  const chat = makeRoute(createWarpChatRouteHandler);
  const actions = makeRoute(createWarpReadActionRouteHandler, { scope: 'actions' });
  await send(chat.route, chatBody, { 'x-real-ip': IP_A });
  await send(actions.route, actionBody, { 'x-real-ip': IP_A });
  const warpChat = chat.calls[0].init.headers['x-warp-client-ref'];
  const warpActions = actions.calls[0].init.headers['x-warp-client-ref'];
  assert.equal(warpChat, expectedWarpRef(IP_A));
  assert.equal(warpChat, warpActions, 'Warp sigue viendo una sola identidad para chat y acciones');
  const rlRef = chat.keys[0].split(':h:')[1];
  assert.notEqual(rlRef, warpChat);
  assert.ok(!warpChat.includes(rlRef) && !rlRef.includes(warpChat));
  // La referencia del limitador nunca viaja a Warp.
  assert.ok(!JSON.stringify(chat.calls[0].init.headers).includes(rlRef));
  assert.ok(!String(chat.calls[0].init.body).includes(rlRef));
});

test('LIMITADOR 6: sin secreto válido → 503, botón oculto y nada guardado', async () => {
  const bad = [
    { RIFEX_RATE_LIMIT_KEY_SECRET: '' },
    { RIFEX_RATE_LIMIT_KEY_SECRET: 'x'.repeat(RATE_LIMIT_KEY_MIN_SECRET - 1) },
    { RIFEX_RATE_LIMIT_KEY_SECRET: '   ' },
    { RIFEX_RATE_LIMIT_KEY_SECRET: WARP_SECRET }, // igual al secreto de identidad de Warp
  ];
  for (const extra of bad) {
    const envVars = env(extra);
    assert.equal(readRateLimitKeySecret(envVars), null);
    assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => readPilotConfig(envVars), readRateLimitSecret: () => readRateLimitKeySecret(envVars) }), { enabled: false });
    for (const [factory, scope, body] of [[createWarpChatRouteHandler, 'chat', chatBody], [createWarpReadActionRouteHandler, 'actions', actionBody]]) {
      const r = makeRoute(factory, { envVars, scope });
      const res = await send(r.route, body, { 'x-real-ip': IP_A });
      assert.equal(res.statusCode, 503);
      assert.match(res.body, /ASSISTANT_NOT_CONFIGURED/);
      assert.equal(r.keys.length, 0, 'no se guarda nada');
      assert.equal(r.calls.length, 0, 'no se llama a Warp');
    }
  }
  assert.equal(readRateLimitKeySecret(env()), RL_SECRET);
  assert.deepEqual(assistantStatus({ enabled: () => true, readConfig: () => readPilotConfig(env()), readRateLimitSecret: () => readRateLimitKeySecret(env()) }), { enabled: true });
});

test('LIMITADOR 7: sin IP confiable → 503 y nada guardado', async () => {
  for (const headers of [{}, { 'x-real-ip': '' }, { 'x-real-ip': 'unknown' }, { 'x-real-ip': '1.2.3.4; drop' }, { 'x-forwarded-for': IP_A }]) {
    const r = makeRoute(createWarpChatRouteHandler);
    const res = await send(r.route, chatBody, headers);
    assert.equal(res.statusCode, 503, JSON.stringify(headers));
    assert.equal(r.keys.length, 0);
    assert.equal(r.calls.length, 0);
  }
});

test('LIMITADOR 8: el navegador no puede elegir ni falsificar la clave', async () => {
  const r = makeRoute(createWarpChatRouteHandler);
  await send(r.route, chatBody, { 'x-real-ip': IP_A });
  await send(r.route, { ...chatBody, key: 'warp-pilot-chat:h:00000000000000000000000000000000', ip: IP_B }, {
    'x-real-ip': IP_A,
    'x-forwarded-for': `${IP_B}, 10.0.0.1`,
    'x-warp-client-ref': 'A'.repeat(32),
    'x-rifex-rate-limit-key': 'warp-pilot-chat:h:00000000000000000000000000000000',
    cookie: 'sb-access-token=prueba',
    'user-agent': 'navegador-de-prueba',
  });
  assert.equal(r.keys.length, 2);
  assert.equal(r.keys[0], r.keys[1]);
  assert.equal(r.keys[1], expectedKey('chat', IP_A));
});

test('LIMITADOR 9: logs, errores y respuestas sin IP, sin referencia y sin secreto', async () => {
  const logged = [];
  const orig = {};
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    orig[m] = console[m];
    console[m] = (...a) => logged.push(a.map(String).join(' '));
  }
  const bodies = [];
  const keys = [];
  try {
    const store = new Map();
    const chat = makeRoute(createWarpChatRouteHandler, { store });
    for (let i = 0; i <= PILOT_RATE_LIMIT_MAX; i += 1) bodies.push(JSON.stringify(await send(chat.route, chatBody, { 'x-real-ip': IP_A })));
    keys.push(...chat.keys);
    bodies.push(JSON.stringify(await send(makeRoute(createWarpChatRouteHandler, { envVars: env({ RIFEX_RATE_LIMIT_KEY_SECRET: '' }) }).route, chatBody, { 'x-real-ip': IP_A })));
    bodies.push(JSON.stringify(await send(makeRoute(createWarpChatRouteHandler).route, chatBody, {})));
    const broken = createPilotPostRoute(() => async () => { throw new Error(`fallo con ${IP_A}`); }, {}, {
      enabled: () => true, rateLimit: async (k) => { keys.push(k); return { allowed: true, retryAfterSeconds: 1 }; },
      readConfig: () => readPilotConfig(env()), readRateLimitSecret: () => RL_SECRET,
    });
    bodies.push(JSON.stringify(await send(broken, chatBody, { 'x-real-ip': IP_A })));
  } finally {
    for (const m of Object.keys(orig)) console[m] = orig[m];
  }
  const out = logged.join('\n') + bodies.join('\n');
  const refs = [...new Set(keys.map((k) => k.split(':h:')[1]))];
  assert.ok(refs.length >= 1);
  for (const forbidden of [IP_A, RL_SECRET, WARP_SECRET, ...refs]) assert.ok(!out.includes(forbidden), 'nada sensible en logs ni respuestas');
  assert.match(bodies.at(-1), /ASSISTANT_NOT_CONFIGURED/, 'error controlado sin detalle');
});

test('LIMITADOR 10: el secreto se lee solo en el servidor y solo en assistantPilot.js; la tabla no cambia', () => {
  const lib = read('src/lib/warp/assistantPilot.js');
  assert.match(lib, /RIFEX_RATE_LIMIT_KEY_SECRET/);
  assert.doesNotMatch(lib, /console\./);
  assert.doesNotMatch(lib, /resolveClientIp|:ip:\$\{/);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const users = walk(path.join(ROOT, 'src'))
    .filter((f) => /\.(m?js|jsx|ts|tsx)$/.test(f) && fs.readFileSync(f, 'utf8').includes('RIFEX_RATE_LIMIT_KEY_SECRET'))
    .map((f) => path.relative(ROOT, f));
  assert.deepEqual(users, ['src/lib/warp/assistantPilot.js']);
  assert.doesNotMatch(lib, /NEXT_PUBLIC_RIFEX_RATE_LIMIT/);
  // El limitador compartido y las demás rutas no cambian de forma de clave.
  assert.match(read('src/lib/rateLimit.js'), /rate_limit_hit/);
});
