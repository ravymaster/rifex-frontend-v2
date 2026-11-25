// tests/registrationPlans.test.mjs
// INSCRIPCIONES V1 — registrationPlans.js es la única autoridad de
// capacidades (sección 10 del mandato). Certifica los valores exactos
// FREE=50/PLUS=200/GOLD=2000 y que PLUS/GOLD nunca son
// publiclyAvailable en V1 (L/M/N del mandato — forgery de plan solo es
// posible si la propia constante lo permitiera).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTRATION_PLANS,
  capacityForPlan,
  isPubliclyAvailablePlan,
  listPubliclyAvailablePlans,
} from '../src/lib/registrationPlans.js';

test('FREE capacity is exactly 50, not purchase-required, publicly available', () => {
  assert.equal(REGISTRATION_PLANS.free.capacity, 50);
  assert.equal(REGISTRATION_PLANS.free.purchaseRequired, false);
  assert.equal(REGISTRATION_PLANS.free.publiclyAvailable, true);
});

test('PLUS capacity is exactly 200 and NOT publicly available in V1', () => {
  assert.equal(REGISTRATION_PLANS.plus.capacity, 200);
  assert.equal(REGISTRATION_PLANS.plus.purchaseRequired, true);
  assert.equal(REGISTRATION_PLANS.plus.publiclyAvailable, false);
});

test('GOLD capacity is exactly 2000 and NOT publicly available in V1', () => {
  assert.equal(REGISTRATION_PLANS.gold.capacity, 2000);
  assert.equal(REGISTRATION_PLANS.gold.purchaseRequired, true);
  assert.equal(REGISTRATION_PLANS.gold.publiclyAvailable, false);
});

test('capacityForPlan resolves correctly and returns null for unknown/forged plan names', () => {
  assert.equal(capacityForPlan('free'), 50);
  assert.equal(capacityForPlan('plus'), 200);
  assert.equal(capacityForPlan('gold'), 2000);
  assert.equal(capacityForPlan('platinum'), null);
  assert.equal(capacityForPlan(undefined), null);
  assert.equal(capacityForPlan('__proto__'), null);
});

test('isPubliclyAvailablePlan is true only for free', () => {
  assert.equal(isPubliclyAvailablePlan('free'), true);
  assert.equal(isPubliclyAvailablePlan('plus'), false);
  assert.equal(isPubliclyAvailablePlan('gold'), false);
  assert.equal(isPubliclyAvailablePlan('nonexistent'), false);
});

test('listPubliclyAvailablePlans returns ONLY free in V1 (Plus/Gold never listed)', () => {
  const list = listPubliclyAvailablePlans();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'free');
});

test('REGISTRATION_PLANS object and each plan entry are frozen (defense-in-depth against runtime mutation)', () => {
  assert.ok(Object.isFrozen(REGISTRATION_PLANS));
  assert.ok(Object.isFrozen(REGISTRATION_PLANS.free));
  assert.ok(Object.isFrozen(REGISTRATION_PLANS.plus));
  assert.ok(Object.isFrozen(REGISTRATION_PLANS.gold));
});
