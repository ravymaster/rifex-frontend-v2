// tests/warpIaPanel.test.mjs
// Panel «Warp IA» (/ia): privado (solo admin), independiente de /admin, lee
// Warp solo desde el servidor, no duplica saldos ni cobra, y muestra
// «No disponible» en vez de ceros inventados. Sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';

const read = (p) => fs.readFileSync(p, 'utf8');
const { WARP_IA_VIEWS, fetchWarpIaView, normalizeWarpIaRows, warpIaConfigured } = await import('../src/lib/warpIaPanel.js');
const { formatCell, NO_DISPONIBLE } = await import('../src/lib/warpIaFormat.js');

test('IA 1: tres vistas exactas', () => {
  assert.deepEqual(Object.keys(WARP_IA_VIEWS), ['clientes', 'recargas', 'consumo']);
  assert.deepEqual(Object.values(WARP_IA_VIEWS).map((v) => v.title), ['Clientes y sitios', 'Recargas', 'Consumo']);
});

test('IA 2: sin API configurada → no disponible y sin llamadas a la red', async () => {
  let calls = 0;
  const r = await fetchWarpIaView('consumo', { env: {}, fetchImpl: async () => { calls++; } });
  assert.deepEqual(r, { available: false, reason: 'api_no_configurada', items: [] });
  assert.equal(calls, 0);
  assert.equal(warpIaConfigured({ WARP_IA_API_URL: 'https://x' }), false);
});

test('IA 3: solo GET con credencial de servidor; campos de lista blanca; ausentes en null (no cero)', async () => {
  let seen;
  const env = { WARP_IA_API_URL: 'https://warp.invalid/ops/', WARP_IA_API_KEY: 'k' };
  const r = await fetchWarpIaView('clientes', {
    env,
    fetchImpl: async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ items: [{ client_name: 'A', domain: 'a.cl', secret: 'x', balance: null }] })); },
  });
  assert.equal(seen.url, 'https://warp.invalid/ops/clientes');
  assert.equal(seen.init.method, 'GET');
  assert.equal(r.available, true);
  assert.equal(r.items[0].client_name, 'A');
  assert.equal(r.items[0].balance, null);
  assert.equal(r.items[0].plan, null);
  assert.ok(!('secret' in r.items[0]));
});

test('IA 4: errores o formato desconocido de Warp → no disponible', async () => {
  const env = { WARP_IA_API_URL: 'https://warp.invalid', WARP_IA_API_KEY: 'k' };
  assert.equal((await fetchWarpIaView('recargas', { env, fetchImpl: async () => new Response('x', { status: 500 }) })).reason, 'warp_no_responde');
  assert.equal((await fetchWarpIaView('recargas', { env, fetchImpl: async () => { throw new Error('red'); } })).reason, 'warp_no_responde');
  assert.equal((await fetchWarpIaView('recargas', { env, fetchImpl: async () => new Response('{"foo":1}') })).reason, 'formato_no_reconocido');
  assert.equal(normalizeWarpIaRows('nada', { items: [] }), null);
});

test('IA 5: formato de celdas — ausente o inválido es «No disponible», el cero real se respeta', () => {
  assert.equal(formatCell({}, ['balance', '', 'money']), NO_DISPONIBLE);
  assert.equal(formatCell({ tokens: null }, ['tokens', '', 'int']), NO_DISPONIBLE);
  assert.equal(formatCell({ created_at: 'nope' }, ['created_at', '', 'date']), NO_DISPONIBLE);
  assert.equal(formatCell({ cost: 0, currency: 'USD' }, ['cost', '', 'money']), '0 USD');
});

test('IA 6: frontera — página y API exigen admin; Rifex no escribe ni cobra; /admin solo enlaza', () => {
  const page = read('src/pages/ia/index.jsx');
  assert.match(page, /export async function getServerSideProps/);
  assert.match(page, /destination: '\/login\?next=\/ia'/);
  assert.match(page, /user\.app_metadata\?\.role !== 'admin'/);
  assert.match(page, /noindex, nofollow/);
  assert.doesNotMatch(page, /WARP_IA_API|warpIaPanel/, 'la página no toca la API de Warp');
  const api = read('src/pages/api/ia/[vista].js');
  assert.match(api, /const auth = await resolveAdmin\(req\);\n\s*if \(!auth\.ok\) return res\.status\(auth\.status\)/);
  assert.match(api, /req\.method !== 'GET'/);
  const lib = read('src/lib/warpIaPanel.js');
  assert.doesNotMatch(lib, /method: '(POST|PUT|PATCH|DELETE)'|supabase|insert\(|upsert\(/i);
  const admin = read('src/pages/admin/index.jsx');
  assert.equal((admin.match(/href="\/ia"/g) || []).length, 1, 'un solo enlace en /admin');
  assert.doesNotMatch(admin, /api\/ia|warpIaPanel/, '/admin no muestra datos de Warp IA');
  assert.match(read('public/robots.txt'), /Disallow: \/ia\n/);
});
