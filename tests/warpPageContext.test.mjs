// tests/warpPageContext.test.mjs
// Contexto de página del asistente (Assistant 0.7.5, Warp Nivel 1): tabla
// cerrada por plantilla de ruta, exclusiones justificadas, esquema del paquete,
// rechazo en la ruta de servidor y ausencia de URL, DOM o datos personales.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { createWarpChatRouteHandler, validatePageContextShape } from '@warp-ai/assistant';
import { PAGE_CONTEXTS, EXCLUDED_PAGE_CONTEXT_ROUTES, PAGE_CONTEXT_ALLOWLIST, pageContextFor } from '../src/lib/warp/pageContexts.js';
import { buildAssistantConfig } from '../src/lib/warp/assistantGlobal.js';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';
const { createPilotPostRoute } = await import('../src/lib/warp/assistantPilot.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const allow = async () => ({ allowed: true, retryAfterSeconds: 1 });

function pageRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (rel !== 'src/pages/api') walk(rel);
      } else if (/\.(js|jsx)$/.test(entry.name) && !entry.name.startsWith('_')) {
        out.push(rel.replace(/^src\/pages/, '').replace(/\.(js|jsx)$/, '').replace(/\/index$/, '') || '/');
      }
    }
  };
  walk('src/pages');
  return new Set(out);
}

test('CONTEXTO 1: cada contexto cumple el esquema cerrado del paquete y la tabla usa rutas reales', () => {
  const routes = pageRoutes();
  for (const [route, c] of Object.entries(PAGE_CONTEXTS)) {
    assert.ok(routes.has(route), `existe la página ${route}`);
    const shape = validatePageContextShape(c);
    assert.ok(shape.ok, `${route}: ${JSON.stringify(c)}`);
    assert.deepEqual(Object.keys(c), ['pageId', 'module', 'area', 'guidance']);
    assert.ok(['public', 'account'].includes(c.area), `${route}: sin área administrativa`);
  }
  const ids = Object.values(PAGE_CONTEXTS).map((c) => c.pageId);
  assert.equal(new Set(ids).size, ids.length, 'pageId únicos');
  assert.deepEqual(PAGE_CONTEXT_ALLOWLIST, Object.values(PAGE_CONTEXTS).map((c) => ({ ...c })));
  assert.equal(PAGE_CONTEXT_ALLOWLIST.length, 21);
});

test('CONTEXTO 2: pagos, scanner, administración, Rifas y datos privados quedan sin contexto', () => {
  const routes = pageRoutes();
  for (const [route, reason] of Object.entries(EXCLUDED_PAGE_CONTEXT_ROUTES)) {
    assert.ok(routes.has(route), `existe la página excluida ${route}`);
    assert.equal(pageContextFor(route), null, route);
    assert.ok(['payments', 'operations', 'administration', 'raffles', 'bank-data', 'private-data', 'third-party-respondent', 'account-recovery', 'technical'].includes(reason), route);
  }
  for (const route of Object.keys(PAGE_CONTEXTS)) assert.ok(!(route in EXCLUDED_PAGE_CONTEXT_ROUTES), route);
  // /panel es el panel de Rifas: sin contexto. El inicio de la cuenta es /mis-iniciativas.
  assert.equal(EXCLUDED_PAGE_CONTEXT_ROUTES['/panel'], 'raffles');
  assert.equal(pageContextFor('/panel'), null);
  assert.equal(pageContextFor('/mis-iniciativas').pageId, 'account-panel');
  assert.match(read('src/pages/panel/index.js'), /Crear rifa/);
  assert.equal(EXCLUDED_PAGE_CONTEXT_ROUTES['/panel/bancos'], 'bank-data');
  const mapped = JSON.stringify(PAGE_CONTEXTS);
  assert.doesNotMatch(mapped, /admin|administrative|checkout|payment|pago|scanner|raffle|rifa|token/i);
});

test('CONTEXTO 3: solo plantillas exactas; la URL real, query, hash o slugs nunca producen contexto', () => {
  assert.deepEqual(pageContextFor('/medidor-qr'), { pageId: 'qr-meter-home', module: 'qr-meter', area: 'public', guidance: 'create-or-learn' });
  assert.equal(pageContextFor('/eventos/[id]').pageId, 'event-detail');
  for (const bad of ['/eventos/noche-de-verano-rifex-live', '/medidor-qr?ref=x', '/medidor-qr#a', '/medidor-qr/', 'medidor-qr', '/MEDIDOR-QR', '__proto__', 'constructor', 'toString', '', null, undefined, 42]) {
    assert.equal(pageContextFor(bad), null, String(bad));
  }
  for (const c of PAGE_CONTEXT_ALLOWLIST) {
    assert.doesNotMatch(JSON.stringify(c), /\d|@|\/|\.|\?|#|=/, 'sin dígitos, correos, URL ni parámetros');
  }
});

test('CONTEXTO 4: el montaje global usa la plantilla de ruta, nunca la URL, el DOM ni la sesión', () => {
  const comp = code('src/components/warp/WarpAssistantGlobal.jsx');
  assert.match(comp, /const \{ pathname \} = useRouter\(\);/);
  assert.match(comp, /widget\.init\(buildAssistantConfig\(createAssistantFetch\(window\.fetch\.bind\(window\)\), pageContextFor\(pathnameRef\.current\)\)\);/);
  assert.match(comp, /widgetRef\.current\?\.setPageContext\?\.\(pageContextFor\(pathname\)\);/);
  assert.match(comp, /\}, \[pathname\]\);/);
  for (const p of ['src/components/warp/WarpAssistantGlobal.jsx', 'src/lib/warp/pageContexts.js', 'src/lib/warp/assistantGlobal.js']) {
    const src = code(p);
    assert.doesNotMatch(src, /asPath|router\.query|\.query\b|location\.|routeChangeComplete|document\.title|document\.cookie|localStorage|sessionStorage|getSession|getUser|app_metadata/, p);
  }
  const lib = code('src/lib/warp/pageContexts.js');
  assert.doesNotMatch(lib, /import /, 'tabla pura, sin dependencias');
  assert.equal(buildAssistantConfig(() => {}, PAGE_CONTEXTS['/contacto']).pageContext.pageId, 'support-contact');
});

// Ruta de servidor de Rifex con el handler de 0.7.5 y un Warp simulado.
function makeRoute() {
  const calls = [];
  const fake = `prueba-${crypto.randomBytes(6).toString('hex')}`;
  const route = createPilotPostRoute(
    (cfg) => createWarpChatRouteHandler({ ...cfg, fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json({ conversationId: 'c1', message: 'ok' }); } }),
    {},
    { rateLimit: allow, enabled: () => true, readConfig: () => ({ apiUrl: 'https://warp.example', apiKey: fake }) },
  );
  return { route, calls, fake };
}
async function post(route, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json', cookie: 'sb-access-token=secreto' };
  const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(s) { this.statusCode = s; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  await route(req, res);
  return res;
}

test('CONTEXTO 5: la ruta de Rifex reenvía a Warp solo un contexto válido, junto al mensaje y la conversación', async () => {
  const { route, calls, fake } = makeRoute();
  const res = await post(route, { message: 'Ya estoy aquí, ¿qué hago?', conversationId: 'c1', pageContext: PAGE_CONTEXTS['/medidor-qr'] });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), { message: 'Ya estoy aquí, ¿qué hago?', conversationId: 'c1', pageContext: { pageId: 'qr-meter-home', module: 'qr-meter', area: 'public', guidance: 'create-or-learn' } });
  assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ['authorization', 'content-type']);
  assert.doesNotMatch(JSON.stringify(calls[0]), /secreto/);
  assert.ok(!String(res.body).includes(fake));
  const noCtx = await post(route, { message: 'hola' });
  assert.equal(noCtx.statusCode, 200);
  assert.deepEqual(JSON.parse(calls[1].init.body), { message: 'hola' });
});

test('CONTEXTO 6: contextos mal formados → 400 sin llamar a Warp', async () => {
  const { route, calls } = makeRoute();
  const base = PAGE_CONTEXTS['/medidor-qr'];
  const bad = [
    { ...base, extra: 'x' },
    { ...base, pageId: 'https://evil.example/x' },
    { ...base, guidance: '/medidor-qr?ref=1' },
    { ...base, pageId: 'rut-12345678-9' },
    { ...base, module: '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0' },
    { ...base, guidance: 'persona@correo.cl' },
    { ...base, area: 'admin' },
    { pageId: 'home', module: 'home', area: 'public' },
    'home',
    ['home'],
    { ...base, pageId: 'Home' },
    { ...base, guidance: 'texto libre con espacios' },
  ];
  for (const pageContext of bad) {
    const res = await post(route, { message: 'hola', pageContext });
    assert.equal(res.statusCode, 400, JSON.stringify(pageContext));
    assert.match(String(res.body), /INVALID_INPUT/);
  }
  assert.equal(calls.length, 0, 'nunca llama a Warp con un contexto inválido');
});

test('CONTEXTO 7: Assistant 0.7.5 instalado desde el tgz verificado; 0.7.4 retirado', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@warp-ai/assistant'], 'file:vendor/warp-sdk-lite/warp-ai-assistant-0.7.5-80db790.tgz');
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.packages['node_modules/@warp-ai/assistant'].version, '0.7.5');
  assert.equal(JSON.parse(read('node_modules/@warp-ai/assistant/package.json')).version, '0.7.5');
  const tgz = fs.readFileSync(path.join(ROOT, 'vendor/warp-sdk-lite/warp-ai-assistant-0.7.5-80db790.tgz'));
  assert.equal(crypto.createHash('sha256').update(tgz).digest('hex'), 'e742afd79a1ee55e91b9b19173208dfd8c238eb51eaa86072cec9a00be62e692');
  assert.ok(!fs.existsSync(path.join(ROOT, 'vendor/warp-sdk-lite/warp-ai-assistant-0.7.4-430b5d8.tgz')));
});
