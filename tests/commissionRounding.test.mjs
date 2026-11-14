// tests/commissionRounding.test.mjs
// Regla única de comisión: ceil(bruto_clp * bps / 10000), sobre el bruto
// total de la operación, redondeada una sola vez al peso superior. Eventos
// y Campañas, base, Mercado Pago, panel y Excel deben coincidir. Sin red,
// sin base y sin pagos: todo se simula.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeCommission,
  computeCommissionCents,
  commissionSnapshotFor,
  contributionCommission,
  publicCommission,
  ROUNDING_NOTE,
} from '../src/lib/commissionPolicy.js';
import { computeEventAnalyticsSummary } from '../src/lib/eventAnalytics.js';
import { buildEventAnalyticsWorkbook } from '../src/lib/eventAnalyticsWorkbook.js';

const read = (p) => readFileSync(p, 'utf8');
const LAUNCH = { RIFEX_COMMISSION_MODE: 'launch' };
const STANDARD = {};
const MIG_B = read('db/migrations/2026-11-13b_commission_round_up.sql');

// Réplica literal de create_event_order_v2 (2026-11-13b).
function eventOrder(items, snapshot) {
  const subtotal = items.reduce((a, { priceClp, qty }) => a + priceClp * 100 * qty, 0);
  const fee = Math.min(Math.floor((subtotal * snapshot.bps + 999999) / 1000000) * 100, subtotal);
  return { subtotal_cents: subtotal, total_cents: subtotal, platform_fee_cents: fee, platform_fee_bps: snapshot.bps, commission_policy: snapshot.policy };
}
// Lo que events/[id]/checkout.js envía como marketplace_fee (sin redondeo).
function eventMpFee(order) {
  const v = Number(order.platform_fee_cents) / 100;
  assert.ok(Number.isInteger(v));
  return v;
}
// Lo que checkout/colecta.js guarda y envía.
function contribution(amountClp, env) {
  const c = contributionCommission(null, amountClp, env);
  return { row: { amount_cents: amountClp * 100, marketplace_fee_cents: c.feeClp * 100, platform_fee_bps: c.bps, commission_policy: c.policy }, mpFee: c.feeClp };
}

const CASES = {
  launch: { env: LAUNCH, bps: 100, policy: 'launch', rows: [[500, 5], [999, 10], [3000, 30], [3050, 31], [3099, 31], [30000, 300], [300000, 3000]] },
  standard: { env: STANDARD, bps: 700, policy: 'standard', rows: [[500, 35], [999, 70], [3000, 210], [3050, 214], [30000, 2100], [300000, 21000]] },
};

for (const [name, { env, bps, policy, rows }] of Object.entries(CASES)) {
  test(`REDONDEO ${name}: todos los montos coinciden en función central, Eventos, Campañas, Mercado Pago y neto`, () => {
    const snap = commissionSnapshotFor('events', env);
    assert.deepEqual(snap, { bps, policy });
    assert.deepEqual(commissionSnapshotFor('campaigns', env), { bps, policy });
    for (const [gross, fee] of rows) {
      assert.equal(computeCommission(gross, bps), fee, `central ${gross}`);
      assert.equal(computeCommissionCents(gross * 100, bps), fee * 100, `central cents ${gross}`);
      const o = eventOrder([{ priceClp: gross, qty: 1 }], snap);
      assert.deepEqual([o.platform_fee_bps, o.commission_policy, o.platform_fee_cents, eventMpFee(o)], [bps, policy, fee * 100, fee], `evento ${gross}`);
      assert.equal(o.subtotal_cents - o.platform_fee_cents, (gross - fee) * 100);
      const c = contribution(gross, env);
      assert.deepEqual([c.row.platform_fee_bps, c.row.commission_policy, c.row.marketplace_fee_cents, c.mpFee], [bps, policy, fee * 100, fee], `campaña ${gross}`);
      assert.equal(c.row.amount_cents - c.row.marketplace_fee_cents, (gross - fee) * 100);
    }
  });
}

test('REDONDEO órdenes múltiples: se suma el bruto total y se redondea una sola vez', () => {
  const L = commissionSnapshotFor('events', LAUNCH);
  // Varias unidades del mismo tipo: 3 × $1.050 = $3.150 → $32 (por entrada serían $33).
  assert.equal(eventMpFee(eventOrder([{ priceClp: 1050, qty: 3 }], L)), 32);
  // Tipos distintos: $1.050 + $2.000 = $3.050 → $31 (por entrada: $11 + $20 = $31; con $2.050: $11 + $21 = $32 ≠ $31).
  assert.equal(eventMpFee(eventOrder([{ priceClp: 1050, qty: 1 }, { priceClp: 2000, qty: 1 }], L)), 31);
  assert.equal(eventMpFee(eventOrder([{ priceClp: 1050, qty: 1 }, { priceClp: 2050, qty: 1 }], L)), 31);
  // Al 7 %: 2 × $1.525 = $3.050 → $214 (por entrada: 2 × ceil($106,75) = $214; con 3 × $1.017 = $3.051 → $214 vs 3 × $72 = $216).
  assert.equal(eventMpFee(eventOrder([{ priceClp: 1017, qty: 3 }], { bps: 700, policy: 'standard' })), 214);
});

test('REDONDEO migración 2026-11-13b: solo cambia la línea de la comisión de create_event_order_v2', () => {
  const MIG_A = read('db/migrations/2026-11-13a_commission_snapshot.sql');
  const body = (src) => src.slice(src.indexOf('function public.create_event_order_v2(')).split('$$')[1];
  const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  const a = norm(body(MIG_A)).replace('v_platform_fee := (v_subtotal * p_platform_fee_bps) / 10000;', 'FEE');
  const b = norm(body(MIG_B)).replace('v_platform_fee := ((v_subtotal * p_platform_fee_bps + 999999) / 1000000) * 100;', 'FEE');
  assert.ok(a.includes('FEE') && b.includes('FEE'));
  assert.equal(b, a);
  const code = MIG_B.replace(/--[^\n]*/g, '');
  // Fuera del cuerpo de la función (ya comparado arriba) no hay cambios de
  // tablas, datos, RLS ni SECURITY DEFINER.
  const outside = code.split('$$').filter((_, i) => i % 2 === 0).join(' ');
  assert.doesNotMatch(outside, /alter table|drop |update |delete |insert |security definer|row level|create policy/i);
  assert.match(code, /grant execute on function public\.create_event_order_v2\(uuid, jsonb, text, text, integer, text, integer\) to service_role;/);
  assert.match(code, /revoke all on function public\.create_event_order_v2\(uuid, jsonb, text, text, integer, text, integer\) from anon, authenticated;/);
  assert.doesNotMatch(code, /function public\.create_event_order\(/);
});

test('REDONDEO reintento, cambio de configuración, webhook duplicado y reembolso no cambian montos', async () => {
  // Aporte creado al 1 % ($3.050 → $31); luego el ambiente vuelve a 7 %.
  const { row } = contribution(3050, LAUNCH);
  const retry = contributionCommission(row, 3050, STANDARD);
  assert.deepEqual([retry.bps, retry.policy, retry.feeClp, retry.reused], [100, 'launch', 31, true]);
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon';
  const { computeColectaTransition } = await import('../src/lib/colectaReconcile.js');
  const mp = { status: 'approved', transaction_amount: 3050, fee_details: [{ type: 'application_fee', amount: 31 }] };
  const t1 = computeColectaTransition(row, mp);
  const t2 = computeColectaTransition(row, mp);
  assert.deepEqual(t1, t2);
  assert.equal(t1.marketplace_fee_cents, row.marketplace_fee_cents);
  // Sin fee_details: se mantiene el guardado.
  assert.equal(computeColectaTransition(row, { status: 'approved', transaction_amount: 3050 }).marketplace_fee_cents, 3100);
});

test('REDONDEO panel y Excel muestran exactamente lo guardado y enviado ($31 y $214, histórico $700)', () => {
  const n1 = eventOrder([{ priceClp: 3050, qty: 1 }], { bps: 100, policy: 'launch' });
  const n7 = eventOrder([{ priceClp: 3050, qty: 1 }], { bps: 700, policy: 'standard' });
  const hist = { subtotal_cents: 1000000, total_cents: 1000000, platform_fee_cents: 70000, platform_fee_bps: 700, commission_policy: 'standard' };
  const ev = { id: 'ev', organizer_id: 'o', title: 'E', status: 'published', starts_at: '2026-11-20T20:00:00.000Z', ends_at: '2026-11-21T02:00:00.000Z', timezone: 'America/Santiago' };
  const orders = [
    { id: 'h', status: 'paid', currency: 'CLP', ...hist, refund_required: false, paid_at: '2026-08-26T06:00:00.000Z', created_at: '2026-08-26T06:00:00.000Z' },
    { id: 'a', status: 'paid', currency: 'CLP', ...n1, refund_required: true, paid_at: '2026-11-13T12:00:00.000Z', created_at: '2026-11-13T12:00:00.000Z' },
    { id: 'b', status: 'paid', currency: 'CLP', ...n7, refund_required: false, paid_at: '2026-11-13T13:00:00.000Z', created_at: '2026-11-13T13:00:00.000Z' },
  ];
  const data = { event: ev, ticketTypes: [], orders, orderItems: [], tickets: [], checkins: [], staff: [] };
  const s = computeEventAnalyticsSummary(data);
  assert.equal(s.financial.commission_total_cents, 70000 + 3100 + 21400);
  assert.equal(s.financial.net_estimated_cents, 1000000 + 305000 * 2 - (70000 + 3100 + 21400));
  const ws = buildEventAnalyticsWorkbook(data, s).getWorksheet('Órdenes-Ventas');
  const col = ws.getRow(1).values.indexOf('Comisión');
  const got = {};
  ws.eachRow((r, i) => { if (i > 1) got[r.getCell(1).value] = r.getCell(col).value; });
  assert.deepEqual(got, { h: 700, a: eventMpFee(n1), b: eventMpFee(n7) });
  assert.deepEqual([got.a, got.b], [31, 214]);
});

test('REDONDEO textos: frase de redondeo en detalle, sin afirmar redondeo hacia abajo', () => {
  assert.equal(ROUNDING_NOTE, 'La comisión se calcula sobre el monto bruto cobrado y, cuando el resultado contiene una fracción de peso, se redondea al peso superior.');
  for (const env of [LAUNCH, STANDARD]) {
    const c = publicCommission(env);
    for (const k of ['faqAnswer', 'termsClause', 'assistantNote', 'roundingNote']) assert.ok(c[k].includes(ROUNDING_NOTE), k);
    assert.doesNotMatch(JSON.stringify(c), /hacia abajo|nunca supera/i);
  }
  // La frase principal de lanzamiento no cambia.
  assert.equal(publicCommission(LAUNCH).statement, 'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas o aportes efectivamente cobrados. Mercado Pago puede aplicar sus propios costos.');
  assert.match(read('src/pages/planes.js'), /\{commission\.roundingNote\}/);
  for (const p of ['src/lib/commissionPolicy.js', 'src/lib/warp/rifexServices.js', 'src/lib/warp/rifexHelp.js']) {
    assert.doesNotMatch(read(p), /hacia abajo|nunca supera/i, p);
  }
});
