// tests/warpIaPanel.test.mjs
// Panel «Warp IA» (/ia): privado (solo admin), independiente de /admin, lee la
// API de billing de Warp DEV solo desde el servidor con la credencial de
// lectura, no duplica saldos ni cobra, y muestra «No disponible» en vez de
// ceros inventados. Sin red: ejemplos del contrato del Note (2026-11-27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'prueba';

const read = (p) => fs.readFileSync(p, 'utf8');
const { WARP_IA_VIEWS, fetchWarpIaView, warpIaConfigured } = await import('../src/lib/warpIaPanel.js');
const { formatCell, NO_DISPONIBLE } = await import('../src/lib/warpIaFormat.js');

const ENV = { WARP_BILLING_API_URL: 'https://warp.invalid/', WARP_BILLING_READ_TOKEN: 'lectura' };
const SITE = {
  siteId: 'site_donapaz_dev', name: 'Huevos Doña Paz DEV', billingEnabled: false, currency: 'CLP', balanceClp: 0, reservedClp: 0,
  dayConsumptionClp: 55, monthConsumptionClp: 55, dailyCapClp: 238, monthlyCapClp: 1900, minBalanceClp: 100, providers: [],
  estado: 'sin_facturacion', detalle: { sinSaldo: false },
};
const RECHARGE = {
  topupId: 'tp_1', siteId: 'site_x', siteName: 'X', provider: 'paypal', currency: 'USD', requestedAmount: 20, creditExpectedClp: 19000,
  fxClpPerUsd: 950, createdAt: 1795000000000, providerPaymentId: 'CAPTURA-SECRETA', providerOrderId: 'ORDEN-SECRETA', providerStatus: 'COMPLETED',
  paymentConfirmed: true, confirmedAt: 1795000100000, balanceCredited: false, creditedAt: null, note: 'monto_no_coincide',
};

function fakeWarp(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url);
    const body = routes[u.pathname];
    if (typeof body === 'function') return body(u);
    if (!body) return new Response('{"error":{"code":"not_found"}}', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { impl, calls };
}

test('IA 1: tres vistas exactas', () => {
  assert.deepEqual(Object.keys(WARP_IA_VIEWS), ['clientes', 'recargas', 'consumo']);
  assert.deepEqual(Object.values(WARP_IA_VIEWS).map((v) => v.title), ['Clientes y sitios', 'Recargas', 'Consumo']);
});

test('IA 2: sin variables → no disponible y sin llamadas a la red', async () => {
  const w = fakeWarp({});
  const r = await fetchWarpIaView('consumo', { env: {}, fetchImpl: w.impl });
  assert.equal(r.available, false);
  assert.equal(r.reason, 'api_no_configurada');
  assert.equal(w.calls.length, 0);
  assert.equal(warpIaConfigured({ WARP_BILLING_API_URL: 'https://x' }), false);
});

test('IA 3: Clientes y sitios — GET /api/v1/admin/billing/sites con Bearer de lectura; lista blanca', async () => {
  const w = fakeWarp({ '/api/v1/admin/billing/sites': { ok: true, sites: [SITE] } });
  const r = await fetchWarpIaView('clientes', { env: ENV, fetchImpl: w.impl });
  assert.equal(w.calls[0].url, 'https://warp.invalid/api/v1/admin/billing/sites');
  assert.equal(w.calls[0].init.method, 'GET');
  assert.equal(w.calls[0].init.headers.Authorization, 'Bearer lectura');
  assert.equal(r.available, true);
  const s = r.items[0];
  assert.equal(s.site_name, 'Huevos Doña Paz DEV');
  assert.equal(s.balance_clp, 0, 'el cero real de Warp se respeta');
  assert.equal(s.estado, 'sin_facturacion');
  assert.equal(s.providers, 'Ninguno configurado');
  assert.ok(!('detalle' in s));
});

test('IA 4: Recargas — pago confirmado y saldo acreditado por separado; ids del proveedor descartados', async () => {
  const w = fakeWarp({ '/api/v1/admin/billing/recharges': { ok: true, unmatchedPayments: 2, recharges: [RECHARGE] } });
  const r = await fetchWarpIaView('recargas', { env: ENV, fetchImpl: w.impl });
  assert.match(w.calls[0].url, /\/api\/v1\/admin\/billing\/recharges\?limit=500$/);
  const x = r.items[0];
  assert.equal(x.payment_confirmed, true);
  assert.equal(x.balance_credited, false);
  assert.equal(x.credited_at, null);
  assert.equal(r.meta.unmatched_payments, 2);
  assert.doesNotMatch(JSON.stringify(r), /SECRETA/);
  assert.equal(formatCell(x, ['credited_at', '', 'date']), NO_DISPONIBLE);
  assert.equal(formatCell(x, ['note', '', 'note']), 'Monto no coincide');
});

test('IA 5: Consumo — sitios y luego consumo por siteId; OpenAI (USD) y descontado (CLP) separados', async () => {
  const w = fakeWarp({
    '/api/v1/admin/billing/sites': { ok: true, sites: [SITE, { ...SITE, siteId: 'site_b', name: 'B' }] },
    '/api/v1/admin/billing/consumption': (u) => {
      const id = u.searchParams.get('siteId');
      const c = id === 'site_b'
        ? { siteId: id, source: 'wallet', walletBilling: true, months: [{ month: '2026-11', chargedClp: 120, openaiCostUsd: 0.12 }], days: [{ day: '2026-11-27', chargedClp: 40, openaiCostUsd: 0.04 }] }
        : { siteId: id, source: 'governor_only', walletBilling: false, days: [], months: [], observedByGovernor: { month: '2026-11', monthSpentUsd: 0.0575 } };
      return new Response(JSON.stringify({ ok: true, consumption: c }));
    },
  });
  const r = await fetchWarpIaView('consumo', { env: ENV, fetchImpl: w.impl });
  const consumptionCalls = w.calls.filter((c) => c.url.includes('/consumption'));
  assert.equal(consumptionCalls.length, 2);
  assert.ok(consumptionCalls.every((c) => /siteId=site_[a-z_]+&days=30$/.test(c.url)));
  const gov = r.items.find((i) => i.site_id === 'site_donapaz_dev');
  assert.equal(gov.openai_cost_usd, 0.0575);
  assert.equal(gov.charged_clp, null, 'sin billetera: descontado no disponible, no cero');
  const wallet = r.items.filter((i) => i.site_id === 'site_b');
  assert.deepEqual(wallet.map((i) => [i.kind, i.openai_cost_usd, i.charged_clp]), [['Mes', 0.12, 120], ['Día', 0.04, 40]]);
});

test('IA 6: errores de Warp → no disponible (credencial rechazada, caída, formato)', async () => {
  const mk = (status, body = '{}') => async () => new Response(body, { status });
  assert.equal((await fetchWarpIaView('clientes', { env: ENV, fetchImpl: mk(401) })).reason, 'warp_rechaza_credencial');
  assert.equal((await fetchWarpIaView('clientes', { env: ENV, fetchImpl: mk(503) })).reason, 'warp_no_responde');
  assert.equal((await fetchWarpIaView('clientes', { env: ENV, fetchImpl: async () => { throw new Error('red'); } })).reason, 'warp_no_responde');
  assert.equal((await fetchWarpIaView('clientes', { env: ENV, fetchImpl: mk(200, '{"ok":true}') })).reason, 'formato_no_reconocido');
});

test('IA 7: formato — ausente es «No disponible», cero real se respeta', () => {
  assert.equal(formatCell({}, ['balance_clp', '', 'clp']), NO_DISPONIBLE);
  assert.equal(formatCell({ balance_clp: 0 }, ['balance_clp', '', 'clp']), '$0 CLP');
  assert.equal(formatCell({ openai_cost_usd: 0.0575 }, ['openai_cost_usd', '', 'usd']), 'US$0,0575');
  assert.equal(formatCell({ x: false }, ['x', '', 'bool']), 'No');
  assert.equal(formatCell({ created_at: 'nope' }, ['created_at', '', 'date']), NO_DISPONIBLE);
});

test('IA 8: frontera — solo GET de lectura, sin token admin ni ruta de resumen; página y API exigen admin; /admin solo enlaza', () => {
  const lib = read('src/lib/warpIaPanel.js');
  assert.doesNotMatch(lib, /method: '(POST|PUT|PATCH|DELETE)'|ADMIN_TOKEN|billing\/summary|\/api\/v1\/billing\/|NEXT_PUBLIC_WARP/);
  assert.match(lib, /process\.env|env\.WARP_BILLING_READ_TOKEN/);
  const page = read('src/pages/ia/index.jsx');
  assert.match(page, /destination: '\/login\?next=\/ia'/);
  assert.match(page, /user\.app_metadata\?\.role !== 'admin'/);
  assert.match(page, /noindex, nofollow/);
  assert.doesNotMatch(page, /WARP_BILLING|warpIaPanel/, 'la página no toca la API de Warp');
  assert.doesNotMatch(page, /<button|method: 'POST'/, 'sin controles para cambiar la facturación');
  for (const label of ['Pago confirmado', 'Saldo acreditado', 'Costo de OpenAI', 'Monto descontado al cliente']) assert.ok(page.includes(label), label);
  const api = read('src/pages/api/ia/[vista].js');
  assert.match(api, /const auth = await resolveAdmin\(req\);\n\s*if \(!auth\.ok\) return res\.status\(auth\.status\)/);
  assert.match(api, /req\.method !== 'GET'/);
  const admin = read('src/pages/admin/index.jsx');
  assert.equal((admin.match(/href="\/ia"/g) || []).length, 1, 'un solo enlace en /admin');
  assert.doesNotMatch(admin, /api\/ia|warpIaPanel/);
  assert.match(read('public/robots.txt'), /Disallow: \/ia\n/);
});
