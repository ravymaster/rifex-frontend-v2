// tests/clpWholePesos.test.mjs
// Montos CLP en pesos completos: aceptar enteros, rechazar decimales y
// formatos ambiguos sin redondear, en servidor, formularios y base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseClpPesos,
  parseClpCents,
  parseStrictPositiveInt,
  CLP_WHOLE_PESOS_MESSAGE,
  INT4_MAX_PESOS,
} from '../src/lib/clpAmount.js';
import { computeCommission, computeCommissionCents } from '../src/lib/commissionPolicy.js';

const read = (p) => readFileSync(p, 'utf8');
const VALID = [500, 999, 3050, 30000, 300000];
const INVALID = [
  3050.5, '3050.5', '3050,5', '3.050,50', '3.050', 1.5, -1, '-1', NaN, Infinity, -Infinity, '1e3', 1e21,
  ' 3050', '3050 ', '+3050', '0x10', '', '   ', null, undefined, true, false, {}, [], [3050], { v: 3050 },
  Number.MAX_SAFE_INTEGER + 2, '9007199254740993', 10n, '٣٠٥٠',
];

test('CLP 1: acepta pesos enteros como número o como cadena de dígitos, sin redondear', () => {
  for (const v of VALID) {
    for (const input of [v, String(v)]) {
      const r = parseClpPesos(input);
      assert.deepEqual(r, { ok: true, pesos: v, cents: v * 100 }, String(input));
    }
  }
});

test('CLP 2: rechaza decimales, separadores, notación científica, espacios y otros tipos', () => {
  for (const v of INVALID) {
    const r = parseClpPesos(v);
    assert.equal(r.ok, false, `debió rechazar ${typeof v === 'bigint' ? `${v}n` : JSON.stringify(v) ?? String(v)}`);
    assert.equal(r.message, CLP_WHOLE_PESOS_MESSAGE);
    assert.equal(r.error, 'invalid_amount');
    assert.ok(!('pesos' in r) && !('cents' in r));
  }
});

test('CLP 3: cero y rangos según el flujo; mensaje claro sin detalles internos', () => {
  assert.equal(parseClpPesos(0).ok, false); // positivo por defecto
  assert.equal(parseClpPesos(0, { min: 0 }).ok, true); // entradas gratuitas
  const low = parseClpPesos(499, { min: 500, max: 10_000_000 });
  assert.equal(low.ok, false);
  assert.match(low.message, /^Ingresa el monto en pesos chilenos completos, sin decimales\. Debe estar entre \$500 y \$10\.000\.000\.$/);
  assert.equal(parseClpPesos(10_000_001, { min: 500, max: 10_000_000 }).ok, false);
  assert.equal(parseClpPesos(10_000_000, { min: 500, max: 10_000_000 }).ok, true);
  // Límite de la columna integer (centavos).
  assert.equal(parseClpPesos(INT4_MAX_PESOS).ok, true);
  assert.equal(parseClpPesos(INT4_MAX_PESOS + 1).ok, false);
  assert.ok((INT4_MAX_PESOS + 1) * 100 > 2147483647 && INT4_MAX_PESOS * 100 <= 2147483647);
  for (const v of INVALID) {
    const r = parseClpPesos(v, { min: 500, max: 10_000_000 });
    assert.doesNotMatch(r.message, /stack|Error|undefined|null|NaN/);
  }
});

test('CLP 4: centavos de la API — solo múltiplos exactos de 100', () => {
  assert.deepEqual(parseClpCents(305000, { min: 0 }), { ok: true, pesos: 3050, cents: 305000 });
  assert.deepEqual(parseClpCents('305000', { min: 0 }), { ok: true, pesos: 3050, cents: 305000 });
  assert.equal(parseClpCents(0, { min: 0 }).ok, true);
  for (const v of [305050, 305000.5, '305050', '305000.0', '3.05e5', -100, 1, 50, ...INVALID]) {
    const r = parseClpCents(v, { min: 0, error: 'invalid_price' });
    assert.equal(r.ok, false, String(typeof v === 'bigint' ? 'bigint' : v));
    assert.equal(r.error, 'invalid_price');
    assert.equal(r.message, CLP_WHOLE_PESOS_MESSAGE);
  }
});

test('CLP 5: cantidades estrictas, sin redondeo', () => {
  assert.equal(parseStrictPositiveInt(3), 3);
  assert.equal(parseStrictPositiveInt('3'), 3);
  for (const v of [0, -1, 2.5, '2.5', '1e2', '', null, true, NaN, Infinity, 1_000_001]) {
    assert.equal(parseStrictPositiveInt(v), null, String(v));
  }
});

test('CLP 6: el servidor valida en cada endpoint antes de escribir, reservar o llamar a Mercado Pago', () => {
  // Campañas: aporte.
  const colecta = read('src/pages/api/checkout/colecta.js');
  assert.match(colecta, /const parsedAmount = parseClpPesos\(amount_clp, \{ min: MIN_AMOUNT_CLP, max: MAX_AMOUNT_CLP, error: "invalid_amount" \}\);/);
  assert.match(colecta, /return res\.status\(400\)\.json\(\{ ok: false, error: parsedAmount\.error, message: parsedAmount\.message \}\);/);
  const iv = colecta.indexOf('parseClpPesos(amount_clp');
  for (const later of ['supabase\n', '.from("colectas")', '.from("colecta_contributions")', 'new MercadoPagoConfig', 'preference.create']) {
    const i = colecta.indexOf(later);
    assert.ok(i === -1 || i > iv, `${later} antes de validar`);
  }
  assert.doesNotMatch(colecta, /Math\.round\(Number\(amount_clp\)\)/);
  // Campañas: meta.
  const colectas = read('src/pages/api/colectas/index.js');
  assert.match(colectas, /const goal = parseClpCents\(req\.body\.goal_cents, \{ min: 1, error: 'invalid_goal' \}\);/);
  assert.ok(colectas.indexOf('parseClpCents(req.body.goal_cents') < colectas.indexOf(".insert("));
  // Eventos: crear y editar tipos de entrada.
  for (const p of ['src/pages/api/events/[id]/ticket-types/index.js', 'src/pages/api/events/[id]/ticket-types/[typeId].js']) {
    const s = read(p);
    assert.match(s, /const price = parseClpCents\(body\.price_cents, \{ min: 0, error: 'invalid_price' \}\);/, p);
    assert.match(s, /if \(!price\.ok\) return res\.status\(400\)\.json\(\{ ok: false, error: price\.error, message: price\.message \}\);/, p);
    assert.doesNotMatch(s, /Math\.round\(Number\(body\.(price_cents|quantity_total|max_per_order)\)\)/, p);
    const write = s.search(/\.(insert|update)\(/);
    assert.ok(s.indexOf('parseClpCents(body.price_cents') < write, `${p}: valida antes de escribir`);
  }
  // Checkout de Eventos: el precio sale de la base, nunca del cliente; cantidades enteras.
  const events = read('src/pages/api/events/[id]/checkout.js');
  assert.match(events, /!Number\.isInteger\(it\.quantity\) \|\| it\.quantity <= 0/);
  assert.doesNotMatch(events, /req\.body\.[a-z_]*price/);
});

test('CLP 7: formularios — teclado numérico, sin decimales, misma validación y mensaje del servidor', () => {
  const ev = read('src/pages/crear-evento.jsx');
  assert.match(ev, /const price = parseClpPesos\(String\(t\.price_cents \?\? ''\)\.trim\(\), \{ min: 0 \}\);/);
  assert.match(ev, /if \(!price\.ok\) \{ updateTicketType\(key, \{ error: price\.message \}\); return; \}/);
  assert.match(ev, /id=\{`price-\$\{t\.key\}`\}[\s\S]*?type="text"[\s\S]*?inputMode="numeric"[\s\S]*?pattern="\[0-9\]\*"[\s\S]*?aria-invalid=[\s\S]*?aria-describedby=\{`price-hint-\$\{t\.key\}`\}/);
  assert.match(ev, /throw new Error\(data\.message \|\| EVENT_ERROR_LABEL\[data\.error\]/);
  assert.doesNotMatch(ev, /Math\.round\(Number\(t\.price_cents\) \* 100\)/);
  const cc = read('src/pages/crear-colecta.jsx');
  assert.match(cc, /const goal = goalClp\.trim\(\) \? parseClpPesos\(goalClp\.trim\(\), \{ min: 1 \}\) : null;/);
  assert.match(cc, /goal_cents: goal \? goal\.cents : null,/);
  assert.match(cc, /id="goal-clp"[\s\S]*?inputMode="numeric"[\s\S]*?aria-describedby="goal-clp-hint"/);
  assert.doesNotMatch(cc, /Math\.round\(Number\(goalClp\) \* 100\)/);
  const cp = read('src/pages/colectas/[id].jsx');
  assert.match(cp, /parseClpPesos\(customAmount\.trim\(\), \{ min: 500, max: 10_000_000 \}\)/);
  assert.match(cp, /id="custom-amount"[\s\S]*?inputMode="numeric"[\s\S]*?aria-describedby="custom-amount-hint"/);
  assert.match(cp, /throw new Error\(data\?\.message \|\| data\?\.error/);
  assert.doesNotMatch(cp, /Math\.round\(Number\(customAmount\)\)/);
  // La función central no usa parseFloat ni redondeos.
  const lib = read('src/lib/clpAmount.js').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(lib, /parseFloat|Math\.round|Math\.floor|Math\.ceil|toFixed|parseInt/);
});

test('CLP 8: restricciones de base aditivas solo en campos ingresados por usuarios', () => {
  const mig = read('db/migrations/2026-11-13c_clp_whole_pesos_checks.sql');
  const code = mig.replace(/--[^\n]*/g, '');
  assert.match(code, /alter table public\.event_ticket_types\n  add constraint event_ticket_types_price_whole_pesos\n    check \(price_cents % 100 = 0\);/);
  assert.match(code, /alter table public\.colectas\n  add constraint colectas_goal_whole_pesos\n    check \(goal_cents is null or goal_cents % 100 = 0\);/);
  assert.match(code, /alter table public\.colecta_contributions\n  add constraint colecta_contributions_amount_whole_pesos\n    check \(amount_cents % 100 = 0\);/);
  // Nada sobre comisiones, subtotales, importes de Mercado Pago ni datos.
  assert.doesNotMatch(code, /fee|subtotal|total_cents|line_total|unit_price|update |delete |insert |drop |not valid/i);
  const rb = read('db/rollback/2026-11-13c_clp_whole_pesos_checks_rollback.sql').replace(/--[^\n]*/g, '');
  assert.equal((rb.match(/drop constraint if exists/g) || []).length, 3);
  assert.doesNotMatch(rb, /update |delete |drop table|drop column/i);
});

test('CLP 9: comisión — bruto entero validado primero, luego redondeo único hacia arriba', () => {
  const g = parseClpPesos('3050');
  assert.ok(g.ok);
  assert.equal(computeCommission(g.pesos, 100), 31);
  assert.equal(computeCommission(g.pesos, 700), 214);
  assert.equal(computeCommissionCents(g.cents, 100), 3100);
  // Varias entradas: se suman precios enteros validados y se redondea una vez.
  const prices = ['1050', '1050', '1050'].map((p) => parseClpCents(String(Number(p) * 100), { min: 0 }));
  assert.ok(prices.every((p) => p.ok));
  const subtotal = prices.reduce((a, p) => a + p.cents, 0);
  assert.equal(computeCommissionCents(subtotal, 100), 3200);
  // Un decimal nunca llega al cálculo.
  assert.equal(parseClpPesos('3050.5').ok, false);
});
