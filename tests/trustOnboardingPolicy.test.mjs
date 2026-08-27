// tests/trustOnboardingPolicy.test.mjs
// TRUST-1 — validación pura del onboarding universal. Sin Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLegalName,
  validateBirthDate,
  validatePhone,
  validateAccountType,
  validateTermsAcceptance,
  validatePrivacyAcceptance,
  validateOnboardingFields,
  isOnboardingComplete,
  missingOnboardingFields,
  declaredAge,
  isDeclaredAdult,
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} from '../src/lib/trustOnboardingPolicy.js';

// ---- validadores individuales ----

test('validateLegalName: rechaza vacío, muy corto, muy largo; acepta nombre real', () => {
  assert.equal(validateLegalName(''), 'invalid_legal_name');
  assert.equal(validateLegalName('Al'), 'invalid_legal_name');
  assert.equal(validateLegalName('a'.repeat(141)), 'invalid_legal_name');
  assert.equal(validateLegalName('Juan Pérez'), null);
  assert.equal(validateLegalName(123), 'invalid_legal_name');
});

test('validateBirthDate: rechaza formato inválido, fecha futura, fecha implausible; acepta fecha real', () => {
  assert.equal(validateBirthDate('no-es-una-fecha'), 'invalid_birth_date');
  const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  assert.equal(validateBirthDate(future), 'birth_date_in_future');
  assert.equal(validateBirthDate('1850-01-01'), 'birth_date_implausible');
  assert.equal(validateBirthDate('1990-05-15'), null);
});

test('validatePhone: rechaza formato inválido; acepta formatos razonables', () => {
  assert.equal(validatePhone('abc'), 'invalid_phone');
  assert.equal(validatePhone('123'), 'invalid_phone');
  assert.equal(validatePhone('+56 9 1234 5678'), null);
  assert.equal(validatePhone('987654321'), null);
});

test('validateAccountType: solo person/organization', () => {
  assert.equal(validateAccountType('person'), null);
  assert.equal(validateAccountType('organization'), null);
  assert.equal(validateAccountType('admin'), 'invalid_account_type');
  assert.equal(validateAccountType(''), 'invalid_account_type');
});

test('validateTermsAcceptance/validatePrivacyAcceptance: exige la versión vigente exacta', () => {
  assert.equal(validateTermsAcceptance(CURRENT_TERMS_VERSION), null);
  assert.equal(validateTermsAcceptance('terms-v0.9'), 'terms_not_accepted');
  assert.equal(validateTermsAcceptance(undefined), 'terms_not_accepted');
  assert.equal(validatePrivacyAcceptance(CURRENT_PRIVACY_VERSION), null);
  assert.equal(validatePrivacyAcceptance('privacy-v0.1'), 'privacy_not_accepted');
});

// ---- edad declarada (nunca "verificada") ----

test('declaredAge: calcula edad completa en años, determinista sin importar la fecha de ejecución', () => {
  const now = new Date();
  // Mismo mes/día que hoy, hace exactamente 20 años -> el cumpleaños de
  // este año "ya pasó" (es hoy), así que la edad siempre da 20, sin
  // depender de en qué fecha corra el test.
  const y = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const exactBirthday = `${y - 20}-${mm}-${dd}`;
  assert.equal(declaredAge(exactBirthday), 20);

  // Un día antes de nacer respecto de "hoy hace 20 años" -> el cumpleaños
  // de este año todavía no llega -> 19.
  const dayBefore = new Date(Date.UTC(y - 20, now.getUTCMonth(), now.getUTCDate() + 1));
  const dayBeforeStr = `${dayBefore.getUTCFullYear()}-${String(dayBefore.getUTCMonth() + 1).padStart(2, '0')}-${String(dayBefore.getUTCDate()).padStart(2, '0')}`;
  assert.equal(declaredAge(dayBeforeStr), 19);
});

test('isDeclaredAdult: true para 18+, false para menor — declarado, nunca verificado', () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const adultBirthDate = `${y - 25}-06-15`;
  const minorBirthDate = `${y - 10}-06-15`;
  assert.equal(isDeclaredAdult(adultBirthDate), true);
  assert.equal(isDeclaredAdult(minorBirthDate), false);
});

// ---- validación de conjunto (submit parcial) ----

test('validateOnboardingFields: campos ausentes no generan error (avance parcial permitido)', () => {
  const errors = validateOnboardingFields({ legal_name: 'Juan Pérez' });
  assert.deepEqual(errors, {});
});

test('validateOnboardingFields: campo presente pero inválido SÍ genera error, aunque otros falten', () => {
  const errors = validateOnboardingFields({ phone: 'abc' });
  assert.equal(errors.phone, 'invalid_phone');
  assert.equal(errors.legal_name, undefined);
});

test('validateOnboardingFields: terms_accepted=true es válido (la versión la fija el servidor, no el cliente)', () => {
  const errors = validateOnboardingFields({ terms_accepted: true });
  assert.equal(errors.terms_accepted, undefined);
});

test('validateOnboardingFields: terms_accepted/privacy_accepted con cualquier valor que no sea exactamente true -> inválido', () => {
  assert.equal(validateOnboardingFields({ terms_accepted: false }).terms_accepted, 'terms_not_accepted');
  assert.equal(validateOnboardingFields({ terms_accepted: 'yes' }).terms_accepted, 'terms_not_accepted');
  assert.equal(validateOnboardingFields({ privacy_accepted: 0 }).privacy_accepted, 'privacy_not_accepted');
  // undefined (campo ausente del todo) no es un error — es avance parcial permitido.
  assert.equal(validateOnboardingFields({}).terms_accepted, undefined);
});

// ---- isOnboardingComplete / missingOnboardingFields (autoridad real) ----

const COMPLETE_RECORD = {
  legal_name: 'Juan Pérez',
  birth_date: '1990-05-15',
  phone: '+56912345678',
  account_type: 'person',
  terms_version: CURRENT_TERMS_VERSION,
  terms_accepted_at: '2026-08-26T00:00:00.000Z',
  privacy_version: CURRENT_PRIVACY_VERSION,
  privacy_accepted_at: '2026-08-26T00:00:00.000Z',
};

test('isOnboardingComplete: true solo cuando TODOS los campos están presentes y válidos', () => {
  assert.equal(isOnboardingComplete(COMPLETE_RECORD), true);
});

test('isOnboardingComplete: false si falta un solo campo, incluso con el resto completo', () => {
  for (const key of Object.keys(COMPLETE_RECORD)) {
    const partial = { ...COMPLETE_RECORD, [key]: null };
    assert.equal(isOnboardingComplete(partial), false, `debe ser incompleto sin ${key}`);
  }
});

test('isOnboardingComplete: false si la versión de términos aceptada quedó desactualizada', () => {
  const stale = { ...COMPLETE_RECORD, terms_version: 'terms-v0.1' };
  assert.equal(isOnboardingComplete(stale), false);
});

test('isOnboardingComplete: null/registro inexistente -> false, nunca lanza', () => {
  assert.equal(isOnboardingComplete(null), false);
  assert.equal(isOnboardingComplete(undefined), false);
});

test('missingOnboardingFields: registro vacío devuelve los 6 campos', () => {
  const missing = missingOnboardingFields({});
  assert.equal(missing.length, 6);
  assert.deepEqual(missing.sort(), ['account_type', 'birth_date', 'legal_name', 'phone', 'privacy_accepted', 'terms_accepted'].sort());
});

test('missingOnboardingFields: registro completo devuelve lista vacía', () => {
  assert.deepEqual(missingOnboardingFields(COMPLETE_RECORD), []);
});

test('missingOnboardingFields: solo reporta lo que realmente falta', () => {
  const partial = { ...COMPLETE_RECORD, phone: null };
  assert.deepEqual(missingOnboardingFields(partial), ['phone']);
});
