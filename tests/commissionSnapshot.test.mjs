// tests/commissionSnapshot.test.mjs
// Snapshot de comisión por operación (platform_fee_bps + commission_policy)
// en Eventos y Campañas. Sin red, sin base y sin pagos: Mercado Pago se
// simula con objetos y la función SQL se replica con aritmética entera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  commissionSnapshotFor,
  contributionCommission,
  isValidSnapshot,
  computeCommission,
  computeCommissionCents,
} from '../src/lib/commissionPolicy.js';
import { computeEventAnalyticsSummary } from '../src/lib/eventAnalytics.js';
import { buildEventAnalyticsWorkbook } from '../src/lib/eventAnalyticsWorkbook.js';

const read = (p) => readFileSync(p, 'utf8');
const LAUNCH = { RIFEX_COMMISSION_MODE: 'launch' };
const STANDARD = {};
const MIGRATION = read('db/migrations/2026-11-13a_commission_snapshot.sql');

// Réplica de create_event_order_v2: (subtotal * bps) / 10000 en enteros y
// tope en el subtotal; el snapshot se guarda con la orden.
function createEventOrderV2(items, snapshot) {
  if (!Number.isInteger(snapshot.bps) || snapshot.bps < 0 || snapshot.bps > 10000) throw new Error('invalid_platform_fee_bps');
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(String(snapshot.policy ?? ''))) throw new Error('invalid_commission_policy');
  const subtotal = items.reduce((a, { priceClp, qty }) => a + priceClp * 100 * qty, 0);
  // Réplica literal de 2026-11-13b: pesos completos, redondeo hacia arriba.
  const fee = Math.min(Math.floor((subtotal * snapshot.bps + 999999) / 1000000) * 100, subtotal);
  return { subtotal_cents: subtotal, total_cents: subtotal, platform_fee_cents: fee, platform_fee_bps: snapshot.bps, commission_policy: snapshot.policy };
}
const mpFeeFromOrder = (o) => {
  const v = Number(o.platform_fee_cents) / 100;
  assert.ok(Number.isInteger(v), `comisión no entera: ${o.platform_fee_cents}`);
  return v;
};

// Fila de aporte como la inserta checkout/colecta.js.
function insertContribution(amountClp, env) {
  const c = contributionCommission(null, amountClp, env);
  return { amount_cents: amountClp * 100, marketplace_fee_cents: c.feeClp * 100, platform_fee_bps: c.bps, commission_policy: c.policy, status: 'pending' };
}

// ------------------------------------------------------------ migración

test('SNAPSHOT 1: migración aditiva — columnas que admiten NULL, sin default y con checks', () => {
  for (const t of ['event_orders', 'colecta_contributions']) {
    assert.match(MIGRATION, new RegExp(`alter table public\\.${t}\\n  add column if not exists platform_fee_bps integer,\\n  add column if not exists commission_policy text;`));
    assert.match(MIGRATION, new RegExp(`${t}_platform_fee_bps_range\\n    check \\(platform_fee_bps is null or \\(platform_fee_bps >= 0 and platform_fee_bps <= 10000\\)\\)`));
    assert.match(MIGRATION, new RegExp(`${t}_commission_policy_format`));
    assert.match(MIGRATION, new RegExp(`${t}_commission_snapshot_pair\\n    check \\(\\(platform_fee_bps is null\\) = \\(commission_policy is null\\)\\)`));
  }
  // Sin default ni NOT NULL: nada se etiqueta con una tasa supuesta.
  const code = MIGRATION.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(code, /\bdefault\b/i);
  assert.doesNotMatch(code, /(integer|text) not null|set not null/i);
  // No toca columnas monetarias, RLS, políticas ni grants de tablas.
  assert.doesNotMatch(code, /drop |rename|alter column|row level security|create policy|alter policy|grant [a-z, ]+ on (table )?public\./i);
  assert.doesNotMatch(code, /security definer/i);
  // La función original queda intacta; la nueva solo la ejecuta service_role.
  assert.doesNotMatch(MIGRATION, /function public\.create_event_order\(/);
  assert.match(MIGRATION, /revoke all on function public\.create_event_order_v2\(uuid, jsonb, text, text, integer, text, integer\) from anon, authenticated;/);
  assert.match(MIGRATION, /grant execute on function public\.create_event_order_v2\(uuid, jsonb, text, text, integer, text, integer\) to service_role;/);
  assert.match(MIGRATION, /set search_path = public/);
});

test('SNAPSHOT 2: create_event_order_v2 conserva la lógica de la original y guarda el snapshot en la misma transacción', () => {
  const orig = read('db/migrations/2026-08-24_event2_checkout_orders.sql');
  const body = (src, name) => src.slice(src.indexOf(`function public.${name}(`)).split('$$')[1];
  const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  let v1 = norm(body(orig, 'create_event_order'));
  let v2 = norm(body(MIGRATION, 'create_event_order_v2'));
  // Diferencias permitidas, exactas:
  v2 = v2
    .replace(" if p_platform_fee_bps is null or p_platform_fee_bps < 0 or p_platform_fee_bps > 10000 then raise exception 'invalid_platform_fee_bps'; end if; if p_commission_policy is null or p_commission_policy !~ '^[a-z][a-z0-9_-]{0,31}$' then raise exception 'invalid_commission_policy'; end if;", '')
    .replace(', reservation_expires_at, platform_fee_bps, commission_policy)', ', reservation_expires_at)')
    .replace(', v_expires, p_platform_fee_bps, p_commission_policy)', ', v_expires)')
    .replace('v_platform_fee := (v_subtotal * p_platform_fee_bps) / 10000;', 'v_platform_fee := floor(v_subtotal * p_platform_fee_rate);');
  assert.equal(v2, v1);
});

// ------------------------------------------------------------ política

test('SNAPSHOT 3: el snapshot es entero en puntos base con su política', () => {
  assert.deepEqual(commissionSnapshotFor('events', LAUNCH), { bps: 100, policy: 'launch' });
  assert.deepEqual(commissionSnapshotFor('campaigns', LAUNCH), { bps: 100, policy: 'launch' });
  assert.deepEqual(commissionSnapshotFor('events', STANDARD), { bps: 700, policy: 'standard' });
  assert.deepEqual(commissionSnapshotFor('campaigns', STANDARD), { bps: 700, policy: 'standard' });
  // Nunca 1 para 1 %.
  assert.notEqual(commissionSnapshotFor('events', LAUNCH).bps, 1);
});

test('SNAPSHOT 4: valores inválidos se rechazan sin convertir ni redondear', () => {
  for (const bps of [1.5, -1, 10001, '100', null, undefined, NaN, Infinity]) {
    assert.equal(isValidSnapshot({ bps, policy: 'launch' }), false, String(bps));
    assert.throws(() => createEventOrderV2([{ priceClp: 3000, qty: 1 }], { bps, policy: 'launch' }));
  }
  for (const policy of ['', 'LAUNCH', 'promo', null, '1x']) assert.equal(isValidSnapshot({ bps: 100, policy }), false, String(policy));
  for (const bps of [0, 100, 700, 10000]) assert.equal(isValidSnapshot({ bps, policy: 'standard' }), true);
  // Un snapshot guardado corrupto no se usa para cobrar.
  assert.throws(() => contributionCommission({ platform_fee_bps: 1.5, commission_policy: 'launch', marketplace_fee_cents: 3000 }, 3000));
  assert.throws(() => contributionCommission({ platform_fee_bps: 100, commission_policy: 'x', marketplace_fee_cents: 3000 }, 3000));
});

// ------------------------------------------------------------ ejemplos

const EXAMPLES = [[3000, 30], [30000, 300], [300000, 3000]];

test('SNAPSHOT 5: Eventos y Campañas — $3.000/$30.000/$300.000 → 100 bps, launch, $30/$300/$3.000', () => {
  for (const [amount, fee] of EXAMPLES) {
    const o = createEventOrderV2([{ priceClp: amount, qty: 1 }], commissionSnapshotFor('events', LAUNCH));
    assert.deepEqual([o.platform_fee_bps, o.commission_policy, mpFeeFromOrder(o)], [100, 'launch', fee]);
    assert.equal(o.subtotal_cents - o.platform_fee_cents, (amount - fee) * 100);
    const c = insertContribution(amount, LAUNCH);
    assert.deepEqual([c.platform_fee_bps, c.commission_policy, c.marketplace_fee_cents], [100, 'launch', fee * 100]);
    // Mercado Pago recibe el monto derivado del snapshot.
    assert.equal(contributionCommission(c, amount).feeClp, fee);
    assert.equal(c.amount_cents - c.marketplace_fee_cents, (amount - fee) * 100);
  }
});

test('SNAPSHOT 6: redondeo único hacia arriba — $3.050 → $31 (1 %) y $214 (7 %), en Eventos y Campañas', () => {
  const L = { bps: 100, policy: 'launch' };
  const STD = { bps: 700, policy: 'standard' };
  // $3.050 al 1 %: $30,50 → $31 en ambos módulos, guardado y enviado igual.
  const o = createEventOrderV2([{ priceClp: 3050, qty: 1 }], L);
  assert.equal(o.platform_fee_cents, 3100);
  assert.equal(mpFeeFromOrder(o), 31);
  assert.equal(insertContribution(3050, LAUNCH).marketplace_fee_cents, 3100);
  // $3.050 al 7 %: $213,50 → $214.
  const o7 = createEventOrderV2([{ priceClp: 3050, qty: 1 }], STD);
  assert.equal(mpFeeFromOrder(o7), 214);
  assert.equal(insertContribution(3050, STANDARD).marketplace_fee_cents, 21400);
  // Mínimo de aporte ($500) → $5 (1 %) y $35 (7 %).
  assert.equal(insertContribution(500, LAUNCH).marketplace_fee_cents, 500);
  assert.equal(insertContribution(500, STANDARD).marketplace_fee_cents, 3500);
  // Varias entradas de distintos tipos: 2 × $3.000 + 1 × $24.000 = $30.000 → $300.
  const multi = createEventOrderV2([{ priceClp: 3000, qty: 2 }, { priceClp: 24000, qty: 1 }], L);
  assert.equal(mpFeeFromOrder(multi), 300);
  assert.equal(multi.platform_fee_bps, 100);
  // Total primero, redondeo una sola vez: 3 × $1.050 = $3.150 → $31,50 → $32.
  // Por entrada serían 3 × ceil($10,50) = $33: NO es la regla.
  const same = createEventOrderV2([{ priceClp: 1050, qty: 3 }], L);
  assert.equal(mpFeeFromOrder(same), 32);
  assert.notEqual(mpFeeFromOrder(same), 3 * Math.ceil(1050 / 100));
  // Tipos distintos: $1.050 + $2.050 = $3.100 → $31 (por entrada serían $11 + $21 = $32).
  const mixed = createEventOrderV2([{ priceClp: 1050, qty: 1 }, { priceClp: 2050, qty: 1 }], L);
  assert.equal(mpFeeFromOrder(mixed), 31);
  // La réplica SQL y la función central coinciden en todo el rango.
  for (let cents = 0; cents <= 5_000_000; cents += 1_337) {
    for (const bps of [100, 700]) {
      assert.equal(computeCommissionCents(cents, bps), Math.min(Math.floor((cents * bps + 999999) / 1000000) * 100, cents), `${cents}/${bps}`);
    }
  }
  for (let clp = 0; clp <= 50_000; clp += 13) {
    for (const bps of [100, 700]) assert.equal(computeCommissionCents(clp * 100, bps), computeCommission(clp, bps) * 100);
  }
});

// ------------------------------------------------------- historial y reintentos

test('SNAPSHOT 7: una operación conserva su snapshot aunque cambie la configuración', () => {
  // Aporte pendiente creado con 1 %; luego el ambiente vuelve a 7 %.
  const pending = insertContribution(30000, LAUNCH);
  const retry = contributionCommission(pending, 30000, STANDARD);
  assert.deepEqual([retry.bps, retry.policy, retry.feeClp, retry.reused], [100, 'launch', 300, true]);
  // Al revés: creado con 7 %, el ambiente pasa a 1 %.
  const historic = insertContribution(3000, STANDARD);
  const retry2 = contributionCommission(historic, 3000, LAUNCH);
  assert.deepEqual([retry2.bps, retry2.policy, retry2.feeClp], [700, 'standard', 210]);
  // Un aporte anterior a esta versión (sin snapshot) lo recibe con la tasa vigente.
  const legacy = { amount_cents: 300000, marketplace_fee_cents: null, platform_fee_bps: null, commission_policy: null };
  assert.deepEqual(contributionCommission(legacy, 3000, LAUNCH), { bps: 100, policy: 'launch', feeClp: 30, reused: false });
});

test('SNAPSHOT 8: webhook duplicado y conciliación no cambian tasa ni monto', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon';
  const { computeColectaTransition } = await import('../src/lib/colectaReconcile.js');
  const row = insertContribution(3000, LAUNCH);
  const mp = { status: 'approved', transaction_amount: 3000, fee_details: [{ type: 'application_fee', amount: 30 }] };
  const a = computeColectaTransition(row, mp);
  const b = computeColectaTransition(row, mp);
  assert.deepEqual(a, b);
  assert.equal(a.marketplace_fee_cents, 3000);
  // La transición nunca devuelve bps ni política: el webhook no los escribe.
  assert.ok(!('platform_fee_bps' in a) && !('commission_policy' in a));
  for (const p of ['src/pages/api/checkout/webhook-colecta.js', 'src/pages/api/checkout/webhook-events.js', 'src/lib/colectaReconcile.js', 'src/pages/api/admin/reconcile-colecta-payments.js', 'src/lib/eventFulfillment.js']) {
    assert.doesNotMatch(read(p), /platform_fee_bps|commission_policy|commissionPolicy/, p);
  }
});

test('SNAPSHOT 9: el navegador no puede enviar ni alterar la tasa (700, 0 o 10000)', () => {
  const colecta = read('src/pages/api/checkout/colecta.js');
  const events = read('src/pages/api/events/[id]/checkout.js');
  assert.match(colecta, /const \{ colecta_id, amount_clp, contributor_name, contributor_email, idempotency_key \} = req\.body \|\| \{\};/);
  for (const src of [colecta, events]) {
    assert.doesNotMatch(src, /req\.body\.(platform_fee_bps|commission_policy|bps|fee|rate|marketplace)/);
    assert.doesNotMatch(src, /(platform_fee_bps|commission_policy)\s*[:=]\s*(body|req|input)/);
  }
  // Eventos: el body solo aporta ítems, email y nombre; la tasa sale del servidor.
  assert.match(events, /const snapshot = commissionSnapshotFor\("events"\);/);
  assert.match(events, /supabase\.rpc\("create_event_order_v2", \{/);
  assert.match(events, /p_platform_fee_bps: snapshot\.bps,\n\s+p_commission_policy: snapshot\.policy,/);
  assert.doesNotMatch(events, /"create_event_order",|p_platform_fee_rate/);
  // Mercado Pago recibe la comisión guardada en la orden.
  assert.match(events, /const feeCLP = Number\(order\.platform_fee_cents\) \/ 100;\n\s+if \(!Number\.isInteger\(feeCLP\)\) \{/);
  assert.doesNotMatch(events, /Math\.round\(Number\(order\.platform_fee_cents\)/);
  assert.match(events, /platform_fee_bps: order\.platform_fee_bps,\n\s+commission_policy: order\.commission_policy,/);
  // Campañas: snapshot en el insert; reintento reutiliza; bruto desde la fila.
  assert.match(colecta, /commission = contributionCommission\(contribution, Math\.round\(contribution\.amount_cents \/ 100\)\);/);
  assert.match(colecta, /\.is\("platform_fee_bps", null\)/);
  assert.match(colecta, /unit_price: grossClp/);
  assert.match(colecta, /marketplace_fee: marketplaceFee,/);
  // La política solo acepta el modo del servidor; un valor de cliente no existe como entrada.
  assert.deepEqual(commissionSnapshotFor('events', { RIFEX_COMMISSION_MODE: '700' }), { bps: 700, policy: 'standard' });
  assert.deepEqual(commissionSnapshotFor('events', { RIFEX_COMMISSION_MODE: '0' }), { bps: 700, policy: 'standard' });
  assert.deepEqual(commissionSnapshotFor('events', { RIFEX_COMMISSION_MODE: '10000' }), { bps: 700, policy: 'standard' });
});

test('SNAPSHOT 10: panel, Excel y reembolsos usan los importes guardados (700 histórico y 100 nuevo)', () => {
  const historic = { ...createEventOrderV2([{ priceClp: 10000, qty: 1 }], { bps: 700, policy: 'standard' }) };
  const fresh = createEventOrderV2([{ priceClp: 30000, qty: 1 }], { bps: 100, policy: 'launch' });
  const ev = { id: 'ev', organizer_id: 'o', title: 'E', status: 'published', starts_at: '2026-11-20T20:00:00.000Z', ends_at: '2026-11-21T02:00:00.000Z', timezone: 'America/Santiago' };
  const orders = [
    { id: 'h', status: 'paid', currency: 'CLP', ...historic, refund_required: false, paid_at: '2026-08-26T06:00:00.000Z', created_at: '2026-08-26T06:00:00.000Z' },
    { id: 'n', status: 'paid', currency: 'CLP', ...fresh, refund_required: true, paid_at: '2026-11-13T12:00:00.000Z', created_at: '2026-11-13T12:00:00.000Z' },
  ];
  const data = { event: ev, ticketTypes: [], orders, orderItems: [], tickets: [], checkins: [], staff: [] };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.financial.commission_total_cents, 70000 + 30000);
  assert.equal(s.financial.net_estimated_cents, 1000000 + 3000000 - 100000);
  const ws = buildEventAnalyticsWorkbook(data, s).getWorksheet('Órdenes-Ventas');
  const col = ws.getRow(1).values.indexOf('Comisión');
  const got = {};
  ws.eachRow((r, n) => { if (n > 1) got[r.getCell(1).value] = r.getCell(col).value; });
  assert.deepEqual(got, { h: 700, n: 300 });
  // Ningún flujo de reembolso o reporte recalcula con la tasa.
  for (const p of ['src/lib/eventAnalytics.js', 'src/lib/eventAnalyticsWorkbook.js', 'src/pages/api/events/[id]/orders-summary.js', 'src/pages/panel/eventos/[id].jsx', 'src/pages/api/panel/earnings.js']) {
    assert.doesNotMatch(read(p), /commissionPolicy|computeCommission|0\.07|0\.01/, p);
  }
  assert.equal(computeCommission(10000, 700), 700);
});
