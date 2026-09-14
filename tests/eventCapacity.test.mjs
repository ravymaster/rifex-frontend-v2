// tests/eventCapacity.test.mjs
// EVENT-8 — pruebas puras de src/lib/eventCapacity.js: parseCapacityInput
// (validación de formato) y computeCommittedCapacity/wouldExceedCapacity
// (espejo en JS de la fórmula real del trigger SQL
// _check_event_capacity). Cubre los escenarios 1-14 (validación de
// capacidad) del mandato EVENT-8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapacityInput, computeCommittedCapacity, wouldExceedCapacity } from '../src/lib/eventCapacity.js';

// ---- parseCapacityInput ----

test('01: capacity ausente en el body -> provided:false, no toca nada', () => {
  const r = parseCapacityInput(undefined);
  assert.equal(r.provided, false);
});

test('02: capacity null -> "sin aforo definido", nunca un valor inventado', () => {
  const r = parseCapacityInput(null);
  assert.deepEqual(r, { provided: true, ok: true, value: null });
});

test('03: capacity "" (string vacío, típico de un input HTML limpiado) -> también null', () => {
  const r = parseCapacityInput('');
  assert.deepEqual(r, { provided: true, ok: true, value: null });
});

test('04: capacity entero positivo válido', () => {
  const r = parseCapacityInput(200);
  assert.deepEqual(r, { provided: true, ok: true, value: 200 });
});

test('05: capacity como string numérico válido (viene de un <input type=number> serializado)', () => {
  const r = parseCapacityInput('150');
  assert.deepEqual(r, { provided: true, ok: true, value: 150 });
});

test('06: capacity 0 -> inválido (0 sería "no vende nada", nunca un aforo real)', () => {
  const r = parseCapacityInput(0);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'invalid_capacity');
});

test('07: capacity negativo -> inválido', () => {
  const r = parseCapacityInput(-5);
  assert.equal(r.ok, false);
});

test('08: capacity decimal se redondea (99.4 -> 99, sigue siendo válido)', () => {
  const r = parseCapacityInput(99.4);
  assert.deepEqual(r, { provided: true, ok: true, value: 99 });
});

test('09: capacity decimal que redondea a 0 (0.4) -> inválido, nunca 0 silencioso', () => {
  const r = parseCapacityInput(0.4);
  assert.equal(r.ok, false);
});

test('10: capacity no numérico ("abc") -> inválido', () => {
  const r = parseCapacityInput('abc');
  assert.equal(r.ok, false);
});

test('11: capacity Infinity -> inválido, nunca un aforo "sin límite" implícito', () => {
  const r = parseCapacityInput(Infinity);
  assert.equal(r.ok, false);
});

test('12: capacity NaN -> inválido', () => {
  const r = parseCapacityInput(NaN);
  assert.equal(r.ok, false);
});

test('13: capacity como array/objeto (payload malformado/adversarial) -> inválido, nunca lanza', () => {
  assert.equal(parseCapacityInput([1, 2]).ok, false);
  assert.equal(parseCapacityInput({ x: 1 }).ok, false);
});

test('14: capacity boolean true -> Number(true)=1, formato técnicamente válido (documentado, no es un caso a bloquear especialmente)', () => {
  const r = parseCapacityInput(true);
  assert.deepEqual(r, { provided: true, ok: true, value: 1 });
});

// ---- computeCommittedCapacity / wouldExceedCapacity ----
// Espejo exacto de _check_event_capacity (SQL): tipos ACTIVOS cuentan su
// quantity_total completo; tipos en cualquier otro estado cuentan
// quantity_sold+quantity_reserved (nunca su quantity_total).

test('15: sin tipos de entrada -> comprometido 0, nunca excede', () => {
  assert.equal(computeCommittedCapacity([]), 0);
  assert.equal(wouldExceedCapacity(10, []), false);
});

test('16: un tipo activo cuenta su quantity_total completo, no lo vendido', () => {
  const types = [{ status: 'active', quantity_total: 50, quantity_sold: 3, quantity_reserved: 0 }];
  assert.equal(computeCommittedCapacity(types), 50);
});

test('17: suma de varios tipos activos <= capacity -> no excede', () => {
  const types = [
    { status: 'active', quantity_total: 5, quantity_sold: 5, quantity_reserved: 0 },
    { status: 'active', quantity_total: 3, quantity_sold: 0, quantity_reserved: 1 },
    { status: 'active', quantity_total: 2, quantity_sold: 0, quantity_reserved: 0 },
  ];
  assert.equal(computeCommittedCapacity(types), 10);
  assert.equal(wouldExceedCapacity(10, types), false);
  assert.equal(wouldExceedCapacity(9, types), true);
});

test('18: capacity null nunca bloquea, sin importar cuánto sumen los tipos', () => {
  const types = [{ status: 'active', quantity_total: 100000, quantity_sold: 0, quantity_reserved: 0 }];
  assert.equal(wouldExceedCapacity(null, types), false);
  assert.equal(wouldExceedCapacity(undefined, types), false);
});

test('19: tipo oculto SIN ventas no aporta nada al comprometido (no hay riesgo real de aforo)', () => {
  const types = [{ status: 'hidden', quantity_total: 80, quantity_sold: 0, quantity_reserved: 0 }];
  assert.equal(computeCommittedCapacity(types), 0);
});

test('20: hallazgo cerrado por diseño — tipo oculto CON ventas reales sigue contando (nunca "desaparece" del aforo)', () => {
  // Caso real que el trigger debe impedir: capacity=10, tipo activo A
  // (total 5, sold 5) + tipo oculto B (total 8, sold 8, ya no vendible).
  // Si solo se sumara "activos.quantity_total" (5), el aforo parecería
  // tener margen (5<=10) cuando en realidad hay 13 asistentes
  // comprometidos (5+8). computeCommittedCapacity debe reflejar los 13.
  const types = [
    { status: 'active', quantity_total: 5, quantity_sold: 5, quantity_reserved: 0 },
    { status: 'hidden', quantity_total: 8, quantity_sold: 8, quantity_reserved: 0 },
  ];
  assert.equal(computeCommittedCapacity(types), 13);
  assert.equal(wouldExceedCapacity(10, types), true, 'reducir/dejar capacity=10 con 13 comprometidos debe bloquearse');
  assert.equal(wouldExceedCapacity(13, types), false);
});

test('21: tipo oculto cuenta reservas también, no solo vendidas (comprometido = sold+reserved)', () => {
  const types = [{ status: 'hidden', quantity_total: 20, quantity_sold: 2, quantity_reserved: 3 }];
  assert.equal(computeCommittedCapacity(types), 5);
});

test('22: quantity_total/sold/reserved ausentes o null se tratan como 0, nunca NaN', () => {
  const types = [{ status: 'active' }, { status: 'hidden' }];
  const committed = computeCommittedCapacity(types);
  assert.equal(committed, 0);
  assert.equal(Number.isNaN(committed), false);
});
