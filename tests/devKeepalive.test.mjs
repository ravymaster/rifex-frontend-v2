// tests/devKeepalive.test.mjs
// Keepalive de Supabase DEV: puerta de entorno, secreto, consulta mínima,
// timeout y respuesta sin datos sensibles. Sin red: la consulta se inyecta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';

const {
  createDevKeepaliveRoute, isAuthorized, isDevKeepaliveEnvironment, readKeepaliveSecret, runKeepaliveProbe,
  DEV_SUPABASE_HOST, KEEPALIVE_TABLE,
} = await import('../src/lib/devKeepalive.js');

// Valores ficticios, solo de prueba.
const SECRET = 'k'.repeat(64);
const DEV_ENV = { NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_SUPABASE_HOST}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-ficticia', RIFEX_DEV_KEEPALIVE_SECRET: SECRET };
const PROD_ENV = { ...DEV_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://wrdkdfuiwlujfxxijpao.supabase.co' };

function fakeRes() {
  return {
    code: 0, body: undefined, headers: {}, ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    end() { this.ended = true; return this; },
  };
}

function route({ env = DEV_ENV, dev = true, probe, timeoutMs = 50, logs = [] } = {}) {
  let calls = 0;
  const p = probe || (async () => ({ status: 200, error: null, data: null }));
  const r = createDevKeepaliveRoute({ env, devStage: () => dev, probe: async (a) => { calls += 1; return p(a); }, timeoutMs, log: (l) => logs.push(l) });
  return { r, calls: () => calls, logs };
}

async function call(r, { method = 'POST', authorization } = {}) {
  const res = fakeRes();
  await r({ method, headers: authorization === undefined ? {} : { authorization } }, res);
  return res;
}

test('KEEPALIVE 1: sin secreto en la solicitud → 401 y no consulta Supabase', async () => {
  const t = route();
  const res = await call(t.r);
  assert.equal(res.code, 401);
  assert.deepEqual(res.body, { ok: false, error: 'unauthorized' });
  assert.equal(t.calls(), 0);
});

test('KEEPALIVE 2: secreto incorrecto, sin Bearer o con prefijo → 401 sin consulta', async () => {
  const t = route();
  for (const authorization of [`Bearer ${'x'.repeat(64)}`, SECRET, `Basic ${SECRET}`, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, 'Bearer ']) {
    const res = await call(t.r, { authorization });
    assert.equal(res.code, 401, authorization.slice(0, 12));
  }
  assert.equal(t.calls(), 0);
  assert.equal(isAuthorized(`Bearer ${SECRET}`, null), false, 'sin secreto configurado nunca autoriza');
});

test('KEEPALIVE 3: secreto correcto → 200 { ok:true, supabase:"ok" } tras una consulta real', async () => {
  const t = route();
  const res = await call(t.r, { authorization: `Bearer ${SECRET}` });
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.supabase, 'ok');
  assert.equal(typeof res.body.durationMs, 'number');
  assert.match(res.body.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(t.calls(), 1);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('KEEPALIVE 4: fuera de DEV la ruta no existe (404), aun con el secreto correcto', async () => {
  for (const [name, opts] of Object.entries({
    'Supabase PROD': { env: PROD_ENV },
    'stage no DEV': { dev: false },
    'URL inválida': { env: { ...DEV_ENV, NEXT_PUBLIC_SUPABASE_URL: 'no-es-url' } },
    'host parecido': { env: { ...DEV_ENV, NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_SUPABASE_HOST}.evil.com` } },
    'sin secreto configurado': { env: { ...DEV_ENV, RIFEX_DEV_KEEPALIVE_SECRET: '' } },
    'secreto corto': { env: { ...DEV_ENV, RIFEX_DEV_KEEPALIVE_SECRET: 'k'.repeat(31) } },
  })) {
    const t = route(opts);
    const res = await call(t.r, { authorization: `Bearer ${SECRET}` });
    assert.equal(res.code, 404, name);
    assert.equal(res.body, undefined, `${name}: sin cuerpo`);
    assert.equal(t.calls(), 0, `${name}: sin consulta`);
  }
  assert.equal(isDevKeepaliveEnvironment(DEV_ENV, () => true), true);
  assert.equal(readKeepaliveSecret({ RIFEX_DEV_KEEPALIVE_SECRET: `  ${SECRET}  ` }), SECRET);
});

test('KEEPALIVE 5: Supabase disponible — la consulta es HEAD de solo lectura sobre events, sin filas', async () => {
  assert.equal(await runKeepaliveProbe({ probe: async () => ({ status: 200, error: null }) }), 'ok');
  assert.equal(await runKeepaliveProbe({ probe: async () => ({ status: 206, error: null }) }), 'ok');
  const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/devKeepalive.js'), 'utf8');
  assert.equal(KEEPALIVE_TABLE, 'events');
  assert.match(src, /\.from\(KEEPALIVE_TABLE\)\.select\('id', \{ head: true \}\)\.limit\(1\)\.abortSignal\(signal\)/);
  assert.match(src, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /SERVICE_ROLE|\.(insert|upsert|delete|rpc)\(|\.from\([^)]*\)\.update\(/, 'sin service_role ni escrituras');
});

test('KEEPALIVE 6: Supabase caído, con error o con timeout → 503 ok:false, sin detalles', async () => {
  const cases = {
    error: async () => ({ status: 401, error: { message: 'permission denied for table events', code: '42501' } }),
    excepcion: async () => { throw new Error('fetch failed host=db.internal password=hunter2'); },
    estado: async () => ({ status: 500, error: null }),
    timeout: ({ signal }) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ status: 0, error: { message: 'AbortError' } }))),
    colgado: () => new Promise(() => {}),
  };
  for (const [name, probe] of Object.entries(cases)) {
    const t = route({ probe, timeoutMs: 30 });
    const res = await call(t.r, { authorization: `Bearer ${SECRET}` });
    assert.equal(res.code, 503, name);
    assert.equal(res.body.ok, false, name);
    assert.equal(res.body.supabase, name === 'timeout' || name === 'colgado' ? 'timeout' : 'error', name);
    assert.doesNotMatch(JSON.stringify(res.body), /permission|42501|hunter2|db\.internal|events/, `${name}: sin detalles internos`);
  }
});

test('KEEPALIVE 7: respuesta y log sin datos sensibles', async () => {
  const logs = [];
  const t = route({ logs, probe: async () => ({ status: 200, error: null, data: [{ id: 'fila-secreta' }], count: 99 }) });
  const res = await call(t.r, { authorization: `Bearer ${SECRET}` });
  assert.deepEqual(Object.keys(res.body).sort(), ['at', 'durationMs', 'ok', 'supabase']);
  const out = JSON.stringify(res.body) + logs.join('\n');
  for (const needle of [SECRET, 'fila-secreta', '99', DEV_SUPABASE_HOST, 'anon-ficticia', 'Bearer']) {
    assert.ok(!out.includes(needle) || (needle === '99' && !/\b99\b/.test(out)), `no expone ${needle.slice(0, 12)}`);
  }
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^dev-keepalive supabase=ok durationMs=\d+$/);
});

test('KEEPALIVE 8: método no permitido → 405 sin consulta (en DEV); fuera de DEV, 404', async () => {
  const t = route();
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
    const res = await call(t.r, { method, authorization: `Bearer ${SECRET}` });
    assert.equal(res.code, 405, method);
    assert.equal(res.headers.allow, 'POST');
  }
  assert.equal(t.calls(), 0);
  const prod = route({ env: PROD_ENV });
  assert.equal((await call(prod.r, { method: 'GET' })).code, 404);
});

test('KEEPALIVE 9: el secreto solo se lee en el servidor y nunca en NEXT_PUBLIC_*', () => {
  const ROOT = process.cwd();
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name) && fs.readFileSync(path.join(ROOT, p), 'utf8').includes('RIFEX_DEV_KEEPALIVE_SECRET')) hits.push(p);
    }
  };
  walk('src');
  assert.deepEqual(hits, ['src/lib/devKeepalive.js']);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'src/lib/devKeepalive.js'), 'utf8'), /NEXT_PUBLIC_[A-Z_]*KEEPALIVE/);
  const routeSrc = fs.readFileSync(path.join(ROOT, 'src/pages/api/internal/dev-keepalive.js'), 'utf8');
  assert.match(routeSrc, /export default createDevKeepaliveRoute\(\);/);
});
