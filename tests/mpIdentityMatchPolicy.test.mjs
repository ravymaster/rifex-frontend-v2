// tests/mpIdentityMatchPolicy.test.mjs
// Corrección canónica (2026-08-27) — coincidencia de identidad RUT
// Rifex <-> titular Mercado Pago. Sin Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MP_MATCH_STATUS,
  isMercadoPagoMatchRequiredForCountry,
  evaluateMpIdentityMatch,
} from '../src/lib/mpIdentityMatchPolicy.js';

test('isMercadoPagoMatchRequiredForCountry: solo Chile, mismo alcance que el RUT', () => {
  assert.equal(isMercadoPagoMatchRequiredForCountry('CL'), true);
  assert.equal(isMercadoPagoMatchRequiredForCountry('AR'), false);
  assert.equal(isMercadoPagoMatchRequiredForCountry(null), false);
  assert.equal(isMercadoPagoMatchRequiredForCountry(undefined), false);
});

test('evaluateMpIdentityMatch: ambos RUT normalizados iguales -> matched', () => {
  assert.equal(
    evaluateMpIdentityMatch({ rifexRutNormalized: '141823094', mpRutNormalized: '141823094' }),
    MP_MATCH_STATUS.MATCHED
  );
});

test('evaluateMpIdentityMatch: RUT distintos -> mismatch', () => {
  assert.equal(
    evaluateMpIdentityMatch({ rifexRutNormalized: '141823094', mpRutNormalized: '111111111' }),
    MP_MATCH_STATUS.MISMATCH
  );
});

test('evaluateMpIdentityMatch: Mercado Pago no entregó identificación -> unavailable, NUNCA matched por defecto', () => {
  assert.equal(
    evaluateMpIdentityMatch({ rifexRutNormalized: '141823094', mpRutNormalized: null }),
    MP_MATCH_STATUS.UNAVAILABLE
  );
  assert.equal(
    evaluateMpIdentityMatch({ rifexRutNormalized: '141823094', mpRutNormalized: undefined }),
    MP_MATCH_STATUS.UNAVAILABLE
  );
});

test('evaluateMpIdentityMatch: Rifex todavía no tiene RUT declarado -> needs_review, nunca compara nada', () => {
  assert.equal(
    evaluateMpIdentityMatch({ rifexRutNormalized: null, mpRutNormalized: '141823094' }),
    MP_MATCH_STATUS.NEEDS_REVIEW
  );
});

test('MP_MATCH_STATUS: incluye exactamente los 7 estados requeridos por la misión', () => {
  const values = Object.values(MP_MATCH_STATUS).sort();
  assert.deepEqual(values, [
    'checking', 'disconnected', 'matched', 'mismatch', 'needs_review', 'not_connected', 'unavailable',
  ].sort());
});
