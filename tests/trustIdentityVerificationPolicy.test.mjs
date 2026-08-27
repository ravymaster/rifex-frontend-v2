// tests/trustIdentityVerificationPolicy.test.mjs
// TRUST-3A — máquina de estados y validación pura. Sin Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERIFICATION_STATUS,
  canTransition,
  nextStatus,
  canUploadDocument,
  accountTypeSupportsVerification,
  isValidReasonCode,
  isTerminalStatus,
  isIdentityVerificationRequiredForCreators,
  detectImageMimeFromMagicBytes,
} from '../src/lib/trustIdentityVerificationPolicy.js';

const S = VERIFICATION_STATUS;

test('canTransition: start solo desde not_started', () => {
  assert.equal(canTransition(S.NOT_STARTED, 'start'), true);
  assert.equal(canTransition(S.DRAFT, 'start'), false);
  assert.equal(canTransition(S.APPROVED, 'start'), false);
});

test('canTransition: submit desde draft o correction_required, nunca desde otro estado', () => {
  assert.equal(canTransition(S.DRAFT, 'submit'), true);
  assert.equal(canTransition(S.CORRECTION_REQUIRED, 'submit'), true);
  assert.equal(canTransition(S.NOT_STARTED, 'submit'), false);
  assert.equal(canTransition(S.SUBMITTED, 'submit'), false);
  assert.equal(canTransition(S.UNDER_REVIEW, 'submit'), false);
  assert.equal(canTransition(S.APPROVED, 'submit'), false);
  assert.equal(canTransition(S.REJECTED, 'submit'), false);
});

test('canTransition: claim solo desde submitted', () => {
  assert.equal(canTransition(S.SUBMITTED, 'claim'), true);
  assert.equal(canTransition(S.UNDER_REVIEW, 'claim'), false);
});

test('canTransition: approve/reject/request_correction solo desde under_review', () => {
  for (const action of ['approve', 'reject', 'request_correction']) {
    assert.equal(canTransition(S.UNDER_REVIEW, action), true, action);
    assert.equal(canTransition(S.SUBMITTED, action), false, action);
    assert.equal(canTransition(S.DRAFT, action), false, action);
  }
});

test('canTransition: revoke solo desde approved', () => {
  assert.equal(canTransition(S.APPROVED, 'revoke'), true);
  assert.equal(canTransition(S.REJECTED, 'revoke'), false);
  assert.equal(canTransition(S.UNDER_REVIEW, 'revoke'), false);
});

test('canTransition: acción desconocida siempre false, nunca lanza', () => {
  assert.equal(canTransition(S.DRAFT, 'nonexistent_action'), false);
});

test('nextStatus: retorna el estado destino correcto por acción', () => {
  assert.equal(nextStatus('start'), S.DRAFT);
  assert.equal(nextStatus('submit'), S.SUBMITTED);
  assert.equal(nextStatus('approve'), S.APPROVED);
  assert.equal(nextStatus('reject'), S.REJECTED);
  assert.equal(nextStatus('request_correction'), S.CORRECTION_REQUIRED);
  assert.equal(nextStatus('revoke'), S.REVOKED);
  assert.equal(nextStatus('no_existe'), null);
});

test('canUploadDocument: solo en draft o correction_required', () => {
  assert.equal(canUploadDocument(S.DRAFT), true);
  assert.equal(canUploadDocument(S.CORRECTION_REQUIRED), true);
  assert.equal(canUploadDocument(S.NOT_STARTED), false);
  assert.equal(canUploadDocument(S.SUBMITTED), false);
  assert.equal(canUploadDocument(S.UNDER_REVIEW), false);
  assert.equal(canUploadDocument(S.APPROVED), false);
  assert.equal(canUploadDocument(S.REJECTED), false);
});

test('isTerminalStatus: solo rejected/expired/revoked son terminales en TRUST-3A', () => {
  assert.equal(isTerminalStatus(S.REJECTED), true);
  assert.equal(isTerminalStatus(S.EXPIRED), true);
  assert.equal(isTerminalStatus(S.REVOKED), true);
  assert.equal(isTerminalStatus(S.APPROVED), false);
  assert.equal(isTerminalStatus(S.DRAFT), false);
});

test('accountTypeSupportsVerification: solo person — organization queda para TRUST-4', () => {
  assert.equal(accountTypeSupportsVerification('person'), true);
  assert.equal(accountTypeSupportsVerification('organization'), false);
  assert.equal(accountTypeSupportsVerification(undefined), false);
  assert.equal(accountTypeSupportsVerification(null), false);
});

test('isValidReasonCode: valida contra la lista correcta según la acción', () => {
  assert.equal(isValidReasonCode('request_correction', 'image_unreadable'), true);
  assert.equal(isValidReasonCode('request_correction', 'document_appears_altered'), false); // es código de reject, no de corrección
  assert.equal(isValidReasonCode('reject', 'document_appears_altered'), true);
  assert.equal(isValidReasonCode('reject', 'image_unreadable'), false); // es código de corrección, no de reject
  assert.equal(isValidReasonCode('approve', 'other'), false); // approve no usa reason_code
  assert.equal(isValidReasonCode('request_correction', 'codigo_inventado'), false);
});

test('isIdentityVerificationRequiredForCreators: apagado por defecto (decisión de negocio pendiente)', () => {
  assert.equal(isIdentityVerificationRequiredForCreators(), false);
});

test('detectImageMimeFromMagicBytes: JPEG real', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  assert.equal(detectImageMimeFromMagicBytes(jpeg), 'image/jpeg');
});

test('detectImageMimeFromMagicBytes: PNG real', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  assert.equal(detectImageMimeFromMagicBytes(png), 'image/png');
});

test('detectImageMimeFromMagicBytes: extensión .jpg falsa sobre contenido de texto -> null', () => {
  const fakeJpeg = Buffer.from('esto no es una imagen, es texto plano', 'utf8');
  assert.equal(detectImageMimeFromMagicBytes(fakeJpeg), null);
});

test('detectImageMimeFromMagicBytes: PDF real (magic %PDF) -> null, nunca aceptado', () => {
  const pdf = Buffer.from('%PDF-1.4\n%...', 'utf8');
  assert.equal(detectImageMimeFromMagicBytes(pdf), null);
});

test('detectImageMimeFromMagicBytes: buffer vacío o muy corto -> null, nunca lanza', () => {
  assert.equal(detectImageMimeFromMagicBytes(Buffer.from([])), null);
  assert.equal(detectImageMimeFromMagicBytes(Buffer.from([0xff])), null);
});
