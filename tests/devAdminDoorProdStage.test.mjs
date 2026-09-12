// tests/devAdminDoorProdStage.test.mjs
// Complemento de tests/devAdminDoor.test.mjs: certifica el tercer
// refuerzo independiente exigido por el mandato -- incluso si alguien
// activara RIFEX_DEV_ADMIN_DOOR y falsificara VERCEL_PROJECT_PRODUCTION_URL
// para que pareciera el proyecto DEV, la puerta sigue cerrada mientras
// NEXT_PUBLIC_STAGE no sea exactamente 'development'.
//
// DEBE lanzarse SIN NEXT_PUBLIC_STAGE=development (proceso separado de
// devAdminDoor.test.mjs -- ver package.json#test:admin-analytics-dev-door
// y la nota sobre el cacheo de STAGE en environmentPolicy.js en el
// encabezado de ese archivo hermano).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDevDoorEligible } from '../src/lib/devAdminDoor.js';
import { isDevStage } from '../src/lib/environmentPolicy.js';

if (isDevStage()) {
  throw new Error(
    'devAdminDoorProdStage.test.mjs debe correr SIN NEXT_PUBLIC_STAGE=development -- usa `npm run test:admin-analytics-dev-door`, no lo mezcles con el proceso del archivo hermano.'
  );
}

test('NOT eligible: RIFEX_DEV_ADMIN_DOOR=on + VERCEL_PROJECT_PRODUCTION_URL forjado como si fuera el proyecto DEV, pero el stage real sigue siendo PROD', () => {
  process.env.RIFEX_DEV_ADMIN_DOOR = 'on';
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'rifex-frontend-main.vercel.app';
  assert.equal(isDevDoorEligible(), false);
});

test('NOT eligible: absolutamente todo a favor salvo el stage (closed by default en PROD real)', () => {
  process.env.RIFEX_DEV_ADMIN_DOOR = 'on';
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'rifex-frontend-main.vercel.app';
  process.env.NODE_ENV = 'development';
  assert.equal(isDevDoorEligible(), false);
});
