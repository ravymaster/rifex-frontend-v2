// tests/registrationFreeQuota.test.mjs
// INSCRIPCIONES V1 — currentFreePeriodKey/nextFreePeriodStartsAt son el
// cálculo puro del "mes calendario" (sección 11 del mandato: NUNCA
// rolling 30 días). Certifica el criterio UTC exacto y los casos límite
// de fin/inicio de mes — incluye el escenario D/F del mandato: crear el
// 18 de septiembre, poder crear otra desde el 1 de octubre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentFreePeriodKey, nextFreePeriodStartsAt } from '../src/lib/registrationFreeQuota.js';

test('currentFreePeriodKey formats as YYYY-MM in UTC', () => {
  assert.equal(currentFreePeriodKey(new Date('2026-09-18T15:00:00.000Z')), '2026-09');
  assert.equal(currentFreePeriodKey(new Date('2026-01-05T00:00:00.000Z')), '2026-01');
});

test('currentFreePeriodKey pads single-digit months', () => {
  assert.equal(currentFreePeriodKey(new Date('2026-03-01T00:00:00.000Z')), '2026-03');
});

test('currentFreePeriodKey: last instant of a month and first instant of next month yield different periods', () => {
  const lastOfSept = new Date('2026-09-30T23:59:59.999Z');
  const firstOfOct = new Date('2026-10-01T00:00:00.000Z');
  assert.equal(currentFreePeriodKey(lastOfSept), '2026-09');
  assert.equal(currentFreePeriodKey(firstOfOct), '2026-10');
  assert.notEqual(currentFreePeriodKey(lastOfSept), currentFreePeriodKey(firstOfOct));
});

test('currentFreePeriodKey: never rolling-30-days — day 18 and day 1 of next month differ by period key, not by a fixed day-count window', () => {
  // Creado 18 de septiembre -> período "2026-09". 25 días después (13 de
  // octubre, MENOS de 30 días desde el 18 de septiembre) ya cae en
  // "2026-10" — si la regla fuera rolling-30-días, seguiría en el mismo
  // período. Esto certifica que el criterio real es SIEMPRE mes
  // calendario, nunca una ventana de 30 días.
  const createdAt = new Date('2026-09-18T12:00:00.000Z');
  const twentyFiveDaysLater = new Date('2026-10-13T12:00:00.000Z');
  assert.equal(currentFreePeriodKey(createdAt), '2026-09');
  assert.equal(currentFreePeriodKey(twentyFiveDaysLater), '2026-10');
});

test('nextFreePeriodStartsAt returns the first UTC instant of the following month', () => {
  const now = new Date('2026-09-18T15:30:00.000Z');
  const next = nextFreePeriodStartsAt(now);
  assert.equal(next.toISOString(), '2026-10-01T00:00:00.000Z');
});

test('nextFreePeriodStartsAt handles December -> January year rollover', () => {
  const now = new Date('2026-12-15T10:00:00.000Z');
  const next = nextFreePeriodStartsAt(now);
  assert.equal(next.toISOString(), '2027-01-01T00:00:00.000Z');
});
