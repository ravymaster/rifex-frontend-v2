// tests/parseRegistrationQr.test.mjs
// INSCRIPCIONES V1 — parseRegistrationQrPayload es la única barrera
// entre lo que la cámara del scanner decodifica y lo que llega a la RPC
// check_in_registration_participant. Certifica: acepta el token puro de
// 64 hex; acepta la URL completa /i/<token> del propio origin; rechaza
// tokens de 32 hex (formato de Eventos — nunca deben validar acá);
// rechaza URLs de otro origin (anti-phishing/cross-site); rechaza texto
// arbitrario/malformado (T del mandato: "malformed QR").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRegistrationQrPayload } from '../src/lib/parseRegistrationQr.js';

const VALID_64 = 'a'.repeat(64);
const EVENTS_32 = 'a'.repeat(32);
const ORIGIN = 'https://rifex.pro';

test('accepts a bare 64-hex token', () => {
  assert.equal(parseRegistrationQrPayload(VALID_64, ORIGIN), VALID_64);
});

test('accepts the full /i/<token> URL from the expected origin', () => {
  assert.equal(parseRegistrationQrPayload(`${ORIGIN}/i/${VALID_64}`, ORIGIN), VALID_64);
});

test('rejects a 32-hex token (Events qr_token format must never validate here)', () => {
  assert.equal(parseRegistrationQrPayload(EVENTS_32, ORIGIN), null);
  assert.equal(parseRegistrationQrPayload(`${ORIGIN}/i/${EVENTS_32}`, ORIGIN), null);
});

test('rejects a valid token path but wrong origin (cross-site QR)', () => {
  assert.equal(parseRegistrationQrPayload(`https://evil.example/i/${VALID_64}`, ORIGIN), null);
});

test('rejects an Events-style /t/<token> path even with a valid-length token', () => {
  assert.equal(parseRegistrationQrPayload(`${ORIGIN}/t/${VALID_64}`, ORIGIN), null);
});

test('rejects malformed/arbitrary text', () => {
  assert.equal(parseRegistrationQrPayload('not a url or token', ORIGIN), null);
  assert.equal(parseRegistrationQrPayload('', ORIGIN), null);
  assert.equal(parseRegistrationQrPayload(null, ORIGIN), null);
  assert.equal(parseRegistrationQrPayload(undefined, ORIGIN), null);
});

test('rejects uppercase hex (canonical tokens are always lowercase)', () => {
  assert.equal(parseRegistrationQrPayload(VALID_64.toUpperCase(), ORIGIN), null);
});
