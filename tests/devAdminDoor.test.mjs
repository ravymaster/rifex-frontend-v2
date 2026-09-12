// tests/devAdminDoor.test.mjs
// Certifica la autoridad más sensible de la puerta temporal DEV:
// isDevDoorEligible() debe ser hard-false en cualquier runtime que no sea
// exactamente el proyecto Vercel `rifex-frontend-main` con la variable
// privada activada -- en particular, DEBE seguir siendo false aunque
// alguien copie accidentalmente la variable o el código a PROD.
//
// IMPORTANTE sobre cómo correr este archivo: src/lib/environmentPolicy.js
// lee `process.env.NEXT_PUBLIC_STAGE` UNA SOLA VEZ, en una constante de
// módulo, en el momento del import (igual que en cualquier proceso
// serverless real de Next.js, donde la env var nunca cambia después de
// arrancar) -- así que isDevStage() no puede alternar dentro de un mismo
// proceso de test. Por eso este archivo asume que el proceso entero se
// lanzó con NEXT_PUBLIC_STAGE=development ya seteado (ver
// package.json#test:admin-analytics-dev-door), y certifica el resto de la
// superficie (RIFEX_DEV_ADMIN_DOOR + identidad de proyecto Vercel) bajo
// ese único stage. El caso "runtime en stage PROD" (el tercer refuerzo)
// se certifica por separado en tests/devAdminDoorProdStage.test.mjs, que
// debe lanzarse SIN esa env var.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isDevDoorEligible, devDoorCookieName } from '../src/lib/devAdminDoor.js';
import { isDevStage } from '../src/lib/environmentPolicy.js';

if (!isDevStage()) {
  throw new Error(
    'devAdminDoor.test.mjs requiere NEXT_PUBLIC_STAGE=development al arrancar el proceso -- usa `npm run test:admin-analytics-dev-door`, no `node --test` directo sobre este archivo.'
  );
}

const ENV_KEYS = ['RIFEX_DEV_ADMIN_DOOR', 'VERCEL_PROJECT_PRODUCTION_URL', 'NODE_ENV'];
let savedEnv = {};

before(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

function setDevProject() {
  process.env.RIFEX_DEV_ADMIN_DOOR = 'on';
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'rifex-frontend-main.vercel.app';
}

test('devDoorCookieName returns a stable, non-empty cookie name', () => {
  assert.equal(typeof devDoorCookieName(), 'string');
  assert.ok(devDoorCookieName().length > 0);
});

test('eligible: all three conditions satisfied on the real DEV project', () => {
  setDevProject();
  assert.equal(isDevDoorEligible(), true);
});

test('NOT eligible: RIFEX_DEV_ADMIN_DOOR env var missing entirely', () => {
  setDevProject();
  delete process.env.RIFEX_DEV_ADMIN_DOOR;
  assert.equal(isDevDoorEligible(), false);
});

test('NOT eligible: RIFEX_DEV_ADMIN_DOOR set to any value other than the exact string "on"', () => {
  setDevProject();
  for (const v of ['true', '1', 'ON', 'yes', ' on', 'on ']) {
    process.env.RIFEX_DEV_ADMIN_DOOR = v;
    assert.equal(isDevDoorEligible(), false, `should reject RIFEX_DEV_ADMIN_DOOR=${JSON.stringify(v)}`);
  }
});

test('NOT eligible: VERCEL_PROJECT_PRODUCTION_URL is the PROD custom domain (rifex.pro)', () => {
  setDevProject();
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'rifex.pro';
  assert.equal(isDevDoorEligible(), false);
});

test('NOT eligible: VERCEL_PROJECT_PRODUCTION_URL is the PROD Vercel project domain (rifex-frontend-v2)', () => {
  setDevProject();
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'rifex-frontend-v2.vercel.app';
  assert.equal(isDevDoorEligible(), false);
});

test('NOT eligible: someone copies the variable to PROD but VERCEL_PROJECT_PRODUCTION_URL still says PROD (the exact accidental-copy scenario the mandate requires to fail closed)', () => {
  process.env.RIFEX_DEV_ADMIN_DOOR = 'on'; // accidentally set on PROD
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'rifex.pro'; // real PROD identity, unforgeable by a human
  assert.equal(isDevDoorEligible(), false);
});

test('NOT eligible: VERCEL_PROJECT_PRODUCTION_URL unrelated to either known project (ambiguous -> fail closed)', () => {
  setDevProject();
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'some-other-project.vercel.app';
  assert.equal(isDevDoorEligible(), false);
});

test('local `next dev` convenience path: no VERCEL_PROJECT_PRODUCTION_URL at all, NODE_ENV=development, variable on -> eligible', () => {
  process.env.RIFEX_DEV_ADMIN_DOOR = 'on';
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.NODE_ENV = 'development';
  assert.equal(isDevDoorEligible(), true);
});

test('NOT eligible: no VERCEL_PROJECT_PRODUCTION_URL but NODE_ENV=production (can never happen on a real PROD Vercel deployment, but must still fail closed)', () => {
  process.env.RIFEX_DEV_ADMIN_DOOR = 'on';
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.NODE_ENV = 'production';
  assert.equal(isDevDoorEligible(), false);
});

test('NOT eligible: RIFEX_DEV_ADMIN_DOOR unset even with everything else looking like DEV (closed by default)', () => {
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'rifex-frontend-main.vercel.app';
  assert.equal(isDevDoorEligible(), false);
});
