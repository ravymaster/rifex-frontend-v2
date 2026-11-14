// tests/launchCommission.test.mjs
// Comisión de lanzamiento (1 %) para Eventos y Campañas desde una fuente
// central, activable solo en el servidor por ambiente. Pruebas sin red, sin
// base de datos y sin pagos reales: Mercado Pago se simula con objetos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  STANDARD_COMMISSION_BPS,
  LAUNCH_COMMISSION_BPS,
  commissionMode,
  commissionBpsFor,
  bpsToRate,
  computeCommission,
  publicCommission,
  commissionStaticProps,
} from '../src/lib/commissionPolicy.js';
import { computeEventAnalyticsSummary } from '../src/lib/eventAnalytics.js';
import { buildEventAnalyticsWorkbook } from '../src/lib/eventAnalyticsWorkbook.js';

const read = (p) => readFileSync(p, 'utf8');
const LAUNCH = { RIFEX_COMMISSION_MODE: 'launch' };
const STANDARD = {};

// Réplica literal (aritmética entera) de create_event_order_v2 (2026-11-13b):
// ((subtotal_cents * bps + 999999) / 1000000) * 100, con tope en el subtotal.
function sqlEventFeeCents(subtotalCents, bps) {
  const raw = Math.floor((subtotalCents * bps + 999999) / 1000000) * 100;
  return Math.max(0, Math.min(raw, subtotalCents));
}
// Lo que events/[id]/checkout.js envía a Mercado Pago: la comisión guardada
// dividida por 100, sin redondear (debe ser entera).
const eventFeeClpSentToMp = (platformFeeCents) => {
  const v = Number(platformFeeCents) / 100;
  assert.ok(Number.isInteger(v), `comisión no entera: ${platformFeeCents}`);
  return v;
};

function eventOrder(items, bps) {
  const subtotal = items.reduce((acc, { priceClp, qty }) => acc + priceClp * 100 * qty, 0);
  const fee = sqlEventFeeCents(subtotal, bps);
  return { subtotal_cents: subtotal, total_cents: subtotal, platform_fee_cents: fee };
}

// ---------------------------------------------------------------- política

test('COMISIÓN 1: sin variable rige la comisión estándar (7%); solo "launch" activa 1 %', () => {
  assert.equal(STANDARD_COMMISSION_BPS, 700);
  assert.equal(LAUNCH_COMMISSION_BPS, 100);
  assert.equal(commissionMode(STANDARD), 'standard');
  for (const v of ['', 'on', '1', 'true', 'promo', 'launch2', '100', '0.01']) {
    assert.equal(commissionMode({ RIFEX_COMMISSION_MODE: v }), 'standard', v);
  }
  assert.equal(commissionMode({ RIFEX_COMMISSION_MODE: ' Launch ' }), 'launch');
  for (const m of ['events', 'campaigns']) {
    assert.equal(commissionBpsFor(m, STANDARD), 700);
    assert.equal(commissionBpsFor(m, LAUNCH), 100);
  }
  // Una variable pública no activa nada: solo cuenta la de servidor.
  assert.equal(commissionMode({ NEXT_PUBLIC_RIFEX_COMMISSION_MODE: 'launch' }), 'standard');
  // Rifas y módulos desconocidos no usan esta política.
  assert.throws(() => commissionBpsFor('raffles', LAUNCH));
  assert.throws(() => commissionBpsFor('x', LAUNCH));
});

test('COMISIÓN 2: la tasa viaja exacta a create_event_order (numeric)', () => {
  assert.equal(JSON.stringify(bpsToRate(100)), '0.01');
  assert.equal(JSON.stringify(bpsToRate(700)), '0.07');
  assert.throws(() => bpsToRate(1.5));
  assert.throws(() => bpsToRate(-1));
  assert.throws(() => bpsToRate(10001));
});

// ------------------------------------------------- ejemplos obligatorios

const EXAMPLES = [
  [3000, 30],
  [30000, 300],
  [300000, 3000],
];

test('COMISIÓN 3: Campañas — $3.000 → $30, $30.000 → $300, $300.000 → $3.000 (y 7% intacto en estándar)', () => {
  for (const [amount, fee] of EXAMPLES) {
    assert.equal(computeCommission(amount, commissionBpsFor('campaigns', LAUNCH)), fee);
    assert.equal(computeCommission(amount, commissionBpsFor('campaigns', STANDARD)), fee * 7);
    // bruto, comisión y neto
    assert.equal(amount - computeCommission(amount, 100), amount - fee);
  }
});

test('COMISIÓN 4: Eventos — $3.000 → $30, $30.000 → $300, $300.000 → $3.000, igual en orden, panel y Mercado Pago', () => {
  for (const [amount, fee] of EXAMPLES) {
    const o = eventOrder([{ priceClp: amount, qty: 1 }], commissionBpsFor('events', LAUNCH));
    assert.equal(o.platform_fee_cents, fee * 100);
    assert.equal(eventFeeClpSentToMp(o.platform_fee_cents), fee);
    // Mismo valor que Campañas: sin diferencias entre módulos en montos enteros.
    assert.equal(eventFeeClpSentToMp(o.platform_fee_cents), computeCommission(amount, 100));
  }
});

test('COMISIÓN 5: Eventos — varias entradas y distintos tipos en una orden', () => {
  // 2 × General $3.000 + 1 × VIP $24.000 = $30.000 → $300
  const o = eventOrder([{ priceClp: 3000, qty: 2 }, { priceClp: 24000, qty: 1 }], 100);
  assert.equal(o.subtotal_cents, 3000000);
  assert.equal(eventFeeClpSentToMp(o.platform_fee_cents), 300);
  // 10 × $30.000 = $300.000 → $3.000
  const big = eventOrder([{ priceClp: 30000, qty: 10 }], 100);
  assert.equal(eventFeeClpSentToMp(big.platform_fee_cents), 3000);
  // La comisión se calcula sobre el subtotal de la orden, no por entrada.
  const mixed = eventOrder([{ priceClp: 1990, qty: 3 }, { priceClp: 4990, qty: 1 }], 100);
  assert.equal(mixed.platform_fee_cents, sqlEventFeeCents(10960 * 100, 100));
  assert.equal(eventFeeClpSentToMp(mixed.platform_fee_cents), 110);
});

test('COMISIÓN 6: redondeo en pesos chilenos e importes mínimos', () => {
  // Regla única: ceil(bruto * bps / 10000), una sola vez, en pesos completos.
  assert.equal(computeCommission(500, 100), 5); // mínimo de aporte en checkout/colecta.js
  assert.equal(computeCommission(599, 100), 6);
  assert.equal(computeCommission(99, 100), 1);
  assert.equal(computeCommission(1, 100), 1);
  assert.equal(computeCommission(0, 100), 0);
  // Eventos y Campañas producen exactamente lo mismo para todo bruto entero.
  for (let a = 0; a <= 50000; a += 7) {
    for (const bps of [100, 700]) {
      const camp = computeCommission(a, bps);
      const ev = eventFeeClpSentToMp(eventOrder([{ priceClp: a, qty: 1 }], bps).platform_fee_cents);
      assert.equal(ev, camp, `a=${a} bps=${bps}`);
      // Nunca más de un peso sobre el porcentaje exacto, y nunca menos.
      assert.ok(camp * 10000 >= a * bps && (camp - 1) * 10000 < a * bps, `a=${a}`);
    }
  }
  // $1 al 1 %: $0,01 → $1 (redondeo al peso superior, tope en el bruto).
  assert.equal(eventFeeClpSentToMp(eventOrder([{ priceClp: 1, qty: 1 }], 100).platform_fee_cents), 1);
  assert.throws(() => computeCommission(-1, 100));
  assert.throws(() => computeCommission(10.5, 100));
});

// ------------------------------------------ servidor como única autoridad

test('COMISIÓN 7: el cliente nunca envía ni altera el porcentaje', () => {
  const colecta = read('src/pages/api/checkout/colecta.js');
  const events = read('src/pages/api/events/[id]/checkout.js');
  // Campañas: el body se desestructura con campos cerrados, sin comisión.
  assert.match(colecta, /const \{ colecta_id, amount_clp, contributor_name, contributor_email, idempotency_key \} = req\.body \|\| \{\};/);
  assert.match(colecta, /const newCommission = contributionCommission\(null, amount\);/);
  assert.match(colecta, /const marketplaceFee = commission\.feeClp;/);
  assert.doesNotMatch(colecta, /RIFEX_FEE_RATE|0\.07|req\.body\.(fee|marketplace|platform|commission|rate)/);
  // Eventos: tasa desde la política, nunca desde el body.
  assert.match(events, /const snapshot = commissionSnapshotFor\("events"\);/);
  assert.match(events, /p_platform_fee_bps: snapshot\.bps,\n\s+p_commission_policy: snapshot\.policy,/);
  assert.doesNotMatch(events, /PLATFORM_FEE_RATE|0\.07|req\.body\.(fee|marketplace|platform|commission|rate)/);
  // Mercado Pago recibe la comisión de la orden guardada.
  assert.match(events, /const feeCLP = Number\(order\.platform_fee_cents\) \/ 100;\n\s+if \(!Number\.isInteger\(feeCLP\)\) \{/);
  assert.match(events, /marketplace_fee: feeCLP,/);
});

test('COMISIÓN 8: la variable es de servidor y no existe ninguna variable pública de comisión', () => {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/.test(f)) files.push(p);
    }
  };
  walk('src');
  const users = files.filter((f) => read(f).includes('RIFEX_COMMISSION_MODE'));
  assert.deepEqual(users, ['src/lib/commissionPolicy.js']);
  for (const f of files) assert.doesNotMatch(read(f), /NEXT_PUBLIC_[A-Z_]*(COMMISSION|FEE)/, f);
  // El módulo antiguo de Eventos ya no existe: no hay una segunda constante.
  assert.ok(!files.includes('src/lib/platformFee.js'));
  // Las páginas reciben el texto ya resuelto en el servidor.
  for (const p of ['src/pages/planes.js', 'src/pages/preguntas-frecuentes.js', 'src/pages/terminos.js', 'src/pages/eventos/index.jsx', 'src/pages/campanas.jsx']) {
    const s = read(p);
    assert.match(s, /export function getStaticProps\(\) \{\n  return commissionStaticProps\(\);\n\}/, p);
    assert.doesNotMatch(s, /commissionMode|commissionBpsFor|process\.env/, p);
  }
});

// --------------------------------- historial, pendientes, webhooks y reintentos

test('COMISIÓN 9: Campañas — webhook y conciliación reutilizan la comisión guardada (7% histórico sigue 7%)', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon';
  const { computeColectaTransition } = await import('../src/lib/colectaReconcile.js');
  const prev = process.env.RIFEX_COMMISSION_MODE;
  process.env.RIFEX_COMMISSION_MODE = 'launch';
  try {
    // Aporte histórico: $3.000 con 7% guardado ($210).
    const historic = { amount_cents: 300000, marketplace_fee_cents: 21000 };
    const mpNoFee = { status: 'approved', transaction_amount: 3000, fee_details: [] };
    assert.equal(computeColectaTransition(historic, mpNoFee).marketplace_fee_cents, 21000);
    // Mercado Pago informa la comisión realmente aplicada ($210): se respeta.
    const mpFee210 = { status: 'approved', transaction_amount: 3000, fee_details: [{ type: 'application_fee', amount: 210 }] };
    assert.equal(computeColectaTransition(historic, mpFee210).marketplace_fee_cents, 21000);
    // Aporte nuevo con 1 %: $3.000 → $30.
    const fresh = { amount_cents: 300000, marketplace_fee_cents: computeCommission(3000, commissionBpsFor('campaigns')) * 100 };
    assert.equal(fresh.marketplace_fee_cents, 3000);
    assert.equal(computeColectaTransition(fresh, mpNoFee).marketplace_fee_cents, 3000);
    // Webhook duplicado / reintento: mismo resultado, sin recalcular.
    const a = computeColectaTransition(fresh, mpNoFee);
    const b = computeColectaTransition(fresh, mpNoFee);
    assert.deepEqual(a, b);
    // Pendiente, rechazado y monto alterado: no se aprueba ni se inventa comisión.
    assert.equal(computeColectaTransition(fresh, { status: 'in_process', transaction_amount: 3000 }).newStatus, null);
    assert.equal(computeColectaTransition(fresh, { status: 'rejected', transaction_amount: 3000 }).newStatus, 'rejected');
    assert.equal(computeColectaTransition(fresh, { status: 'approved', transaction_amount: 1 }).reason, 'amount_mismatch');
  } finally {
    if (prev === undefined) delete process.env.RIFEX_COMMISSION_MODE;
    else process.env.RIFEX_COMMISSION_MODE = prev;
  }
  // Ni el webhook ni la conciliación consultan la tarifa vigente.
  for (const p of ['src/pages/api/checkout/webhook-colecta.js', 'src/lib/colectaReconcile.js', 'src/pages/api/checkout/webhook-events.js', 'src/lib/eventFulfillment.js']) {
    assert.doesNotMatch(read(p), /commissionPolicy|feePolicy|commissionBpsFor|computeCommission|0\.07/, p);
  }
});

test('COMISIÓN 10: Campañas — un aporte pendiente con comisión registrada la conserva al reintentar', () => {
  const colecta = read('src/pages/api/checkout/colecta.js');
  // Reintento con la misma idempotency_key y preferencia ya creada: devuelve
  // la comisión guardada, sin recalcular.
  assert.match(colecta, /if \(existing\.mp_init_point\) \{[\s\S]*?marketplace_fee: existing\.marketplace_fee_cents != null \? Math\.round\(existing\.marketplace_fee_cents \/ 100\) : undefined,/);
  // La comisión se guarda al crear el aporte, con su tasa y política.
  assert.match(colecta, /marketplace_fee_cents: newCommission\.feeClp \* 100,\n\s+platform_fee_bps: newCommission\.bps,\n\s+commission_policy: newCommission\.policy,/);
  assert.match(colecta, /\.update\(\{ mp_preference_id: mpPreferenceId, mp_init_point: initPoint \}\)/);
});

test('COMISIÓN 11: Eventos — panel y Excel muestran la comisión guardada de cada orden (7% histórico y 1 % nuevo)', async () => {
  const historic = eventOrder([{ priceClp: 3000, qty: 1 }], 700); // $210
  const fresh = eventOrder([{ priceClp: 3000, qty: 1 }], 100); // $30
  const data = {
    event: { id: 'ev-1', organizer_id: 'org-1', title: 'Evento', status: 'published', starts_at: '2026-11-20T20:00:00.000Z', ends_at: '2026-11-21T02:00:00.000Z', timezone: 'America/Santiago' },
    ticketTypes: [],
    orders: [
      { id: 'o-hist', status: 'paid', currency: 'CLP', ...historic, refund_required: false, paid_at: '2026-11-01T12:00:00.000Z', created_at: '2026-11-01T11:00:00.000Z' },
      { id: 'o-new', status: 'paid', currency: 'CLP', ...fresh, refund_required: false, paid_at: '2026-11-13T12:00:00.000Z', created_at: '2026-11-13T11:00:00.000Z' },
      { id: 'o-refund', status: 'paid', currency: 'CLP', ...fresh, refund_required: true, paid_at: '2026-11-13T13:00:00.000Z', created_at: '2026-11-13T12:30:00.000Z' },
      { id: 'o-pend', status: 'pending', currency: 'CLP', ...fresh, refund_required: false, paid_at: null, created_at: '2026-11-13T14:00:00.000Z' },
      { id: 'o-fail', status: 'expired', currency: 'CLP', ...fresh, refund_required: false, paid_at: null, created_at: '2026-11-13T15:00:00.000Z' },
    ],
    orderItems: [], tickets: [], checkins: [], staff: [],
  };
  const s = computeEventAnalyticsSummary(data);
  // Aprobadas: 210 + 30 + 30 (la marcada para reembolso conserva su importe original).
  assert.equal(s.financial.commission_total_cents, 21000 + 3000 + 3000);
  assert.equal(s.financial.gross_approved_total_cents, 900000);
  assert.equal(s.financial.net_estimated_cents, 900000 - 27000);

  const wb = buildEventAnalyticsWorkbook(data, s);
  const ws = wb.getWorksheet('Órdenes-Ventas');
  const header = ws.getRow(1).values;
  const col = header.indexOf('Comisión');
  const byId = {};
  ws.eachRow((row, n) => { if (n > 1) byId[row.getCell(1).value] = row.getCell(col).value; });
  assert.equal(byId['o-hist'], 210);
  assert.equal(byId['o-new'], 30);
  const summary = wb.getWorksheet('Resumen');
  let total = null;
  summary.eachRow((row) => { if (row.getCell(1).value === 'Comisión Rifex total') total = row.getCell(2).value; });
  assert.equal(total, 270);
});

test('COMISIÓN 12: Rifas conserva su comisión propia (fuera de alcance)', () => {
  const mp = read('src/pages/api/checkout/mp.js');
  assert.match(mp, /const RIFEX_FEE_RATE = 0\.07;/);
  assert.match(mp, /computePlatformFeeMinor\(totalCLP, engineCountry \|\| "CL", providerId\)/);
  assert.doesNotMatch(mp, /commissionPolicy/);
  assert.match(read('src/lib/paymentEngine/feePolicy.js'), /"CL:mercado_pago": 0\.07,/);
  assert.match(read('src/pages/terminos-rifas.js'), /7%/);
});

// ------------------------------------------------------------ textos

test('COMISIÓN 13: textos — modo lanzamiento usa la frase autorizada y no menciona 7%', () => {
  const c = publicCommission(LAUNCH);
  assert.equal(
    c.statement,
    'Comisión de lanzamiento: solo 1 %. Publica sin costo y sin mensualidad. Rifex cobra el 1 % únicamente sobre ventas o aportes efectivamente cobrados. Mercado Pago puede aplicar sus propios costos.'
  );
  assert.equal(c.bps, 100);
  assert.equal(c.promotional, true);
  const all = JSON.stringify(c);
  assert.doesNotMatch(all, /7 ?%|0[.,]07/);
  // Sin afirmar costos fijos de Mercado Pago ni un costo conjunto.
  assert.doesNotMatch(all, /\b[34] ?%/);
  assert.match(all, /Mercado Pago puede aplicar sus propios costos/);
  for (const k of ['eventsPricing', 'campaignsPricing', 'planDesc', 'faqAnswer', 'termsClause', 'assistantNote', 'metaDescription']) {
    assert.match(c[k], /1 %/, k);
    assert.match(c[k], /lanzamiento|promocional/, k);
  }
  assert.deepEqual(commissionStaticProps(LAUNCH), { props: { commission: c } });
});

test('COMISIÓN 14: textos — modo estándar conserva exactamente los textos vigentes de 7%', () => {
  const c = publicCommission(STANDARD);
  assert.equal(c.bps, 700);
  assert.equal(c.promotional, false);
  assert.equal(c.planName, '7% por venta o aporte exitoso');
  assert.deepEqual(c.chip, { value: '7%', label: 'Comisión de servicio' });
  assert.equal(c.eventsSecurityLine, 'La comisión de servicio de Rifex es del 7%, aplicada solo sobre ventas efectivamente cobradas.');
  assert.equal(c.eventsPricing, 'Sin costo por publicar ni mensualidad. Comisión de Rifex del 7% solo sobre ventas efectivamente cobradas.');
  assert.equal(c.campaignsPricing, 'Sin costo por publicar ni mensualidad. Comisión de Rifex del 7% solo sobre aportes exitosos.');
  // Única adición en modo estándar: la frase de redondeo en textos de detalle.
  assert.equal(c.assistantNote, 'Rifex cobra una comisión única del 7% solo cuando existe una venta o aporte exitoso. Sin planes, mensualidad ni cobro por publicar. La comisión se calcula sobre el monto bruto cobrado y, cuando el resultado contiene una fracción de peso, se redondea al peso superior.');
  assert.equal(c.metaDescription, 'Rifex cobra una comisión única del 7% por venta o aporte exitoso. Sin planes, sin mensualidad, sin cobro por publicar.');
  assert.doesNotMatch(JSON.stringify(c), /lanzamiento|1 %/);
  // /campanas solo agrega textos en modo lanzamiento.
  assert.match(read('src/pages/campanas.jsx'), /commission\.promotional \? \[\.\.\.SECURITY, commission\.campaignsPricing\] : SECURITY/);
});

// ------------------------------------------------------------ asistente

// COMISIÓN 15 (fuentes del asistente) no aplica en main: Warp no forma
// parte de esta rama.
