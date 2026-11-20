// tests/trustOnboardingPolicy.test.mjs
// TRUST-1 — validación pura del onboarding universal. Sin Supabase.
// Corrección canónica (2026-08-27): person_name/organization_name
// reemplazan legal_name+account_type; adult_declared reemplaza
// birth_date por completo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePersonName,
  validateOrganizationName,
  validateBothNamesNotProvidedTogether,
  deriveAccountType,
  validatePhone,
  normalizePhone,
  validateAccountType,
  validateTermsAcceptance,
  validatePrivacyAcceptance,
  validateAdultDeclaration,
  validateOnboardingFields,
  isOnboardingComplete,
  missingOnboardingFields,
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_ADULT_DECLARATION_VERSION,
} from '../src/lib/trustOnboardingPolicy.js';

// ---- validadores individuales ----

test('validatePersonName: rechaza vacío, muy corto, muy largo; acepta nombre real', () => {
  assert.equal(validatePersonName(''), 'invalid_person_name');
  assert.equal(validatePersonName('Al'), 'invalid_person_name');
  assert.equal(validatePersonName('a'.repeat(141)), 'invalid_person_name');
  assert.equal(validatePersonName('Juan Pérez'), null);
  assert.equal(validatePersonName(123), 'invalid_person_name');
});

test('validateOrganizationName: mismas reglas que persona, nombre propio', () => {
  assert.equal(validateOrganizationName(''), 'invalid_organization_name');
  assert.equal(validateOrganizationName('ONG Fixture Real'), null);
});

test('validateBothNamesNotProvidedTogether: rechaza cuando ambos vienen llenos en la misma petición', () => {
  assert.equal(validateBothNamesNotProvidedTogether({ person_name: 'Juan Pérez', organization_name: 'ONG X' }), 'both_names_provided');
  assert.equal(validateBothNamesNotProvidedTogether({ person_name: 'Juan Pérez' }), null);
  assert.equal(validateBothNamesNotProvidedTogether({ organization_name: 'ONG X' }), null);
  assert.equal(validateBothNamesNotProvidedTogether({}), null);
  // Espacios en blanco no cuentan como "lleno".
  assert.equal(validateBothNamesNotProvidedTogether({ person_name: '  ', organization_name: 'ONG X' }), null);
});

test('deriveAccountType: nunca confía en un valor mandado por el cliente, siempre lo deriva', () => {
  assert.equal(deriveAccountType({ person_name: 'Juan Pérez', organization_name: '' }), 'person');
  assert.equal(deriveAccountType({ person_name: '', organization_name: 'ONG X' }), 'organization');
  assert.equal(deriveAccountType({ person_name: '', organization_name: '' }), null);
  assert.equal(deriveAccountType({ person_name: 'Juan Pérez', organization_name: 'ONG X' }), null); // ambos llenos -> estado inválido, sin clasificación
  assert.equal(deriveAccountType({}), null);
  assert.equal(deriveAccountType(undefined), null);
});

test('validatePhone: Chile exige exactamente 9 dígitos empezando en 9', () => {
  assert.equal(validatePhone('959904311', 'CL'), null);
  assert.equal(validatePhone('+56959904311', 'CL'), null); // ya normalizado, también válido
  assert.equal(validatePhone('859904311', 'CL'), 'invalid_phone'); // no empieza en 9
  assert.equal(validatePhone('95990431', 'CL'), 'invalid_phone'); // 8 dígitos, falta uno
  assert.equal(validatePhone('9599043111', 'CL'), 'invalid_phone'); // 10 dígitos, sobra uno
  assert.equal(validatePhone('abc', 'CL'), 'invalid_phone');
});

test('validatePhone: país sin regla propia usa el patrón genérico existente', () => {
  assert.equal(validatePhone('+54 9 1234 5678', 'AR'), null);
  assert.equal(validatePhone('123', 'AR'), 'invalid_phone');
});

test('normalizePhone: Chile siempre produce +56 + 9 dígitos, sin importar el formato de entrada', () => {
  assert.equal(normalizePhone('959904311', 'CL'), '+56959904311');
  assert.equal(normalizePhone('+56959904311', 'CL'), '+56959904311');
  assert.equal(normalizePhone('9 5990 4311', 'CL'), '+56959904311');
});

test('validateAccountType: solo person/organization', () => {
  assert.equal(validateAccountType('person'), null);
  assert.equal(validateAccountType('organization'), null);
  assert.equal(validateAccountType('admin'), 'invalid_account_type');
});

test('validateTermsAcceptance/validatePrivacyAcceptance: solo la versión vigente cuenta', () => {
  assert.equal(validateTermsAcceptance(CURRENT_TERMS_VERSION), null);
  assert.equal(validateTermsAcceptance('terms-v0.1'), 'terms_not_accepted');
  assert.equal(validatePrivacyAcceptance(CURRENT_PRIVACY_VERSION), null);
  assert.equal(validatePrivacyAcceptance('privacy-v0.1'), 'privacy_not_accepted');
});

test('validateAdultDeclaration: nunca una fecha, solo un booleano exactamente true', () => {
  assert.equal(validateAdultDeclaration(true), null);
  assert.equal(validateAdultDeclaration(false), 'adult_declaration_required');
  assert.equal(validateAdultDeclaration('1990-05-15'), 'adult_declaration_required'); // una fecha nunca es válida acá
  assert.equal(validateAdultDeclaration(undefined), 'adult_declaration_required');
});

// ---- validación de conjunto (submit parcial) ----

test('validateOnboardingFields: campos ausentes no generan error (avance parcial permitido)', () => {
  const errors = validateOnboardingFields({ person_name: 'Juan Pérez' });
  assert.deepEqual(errors, {});
});

test('validateOnboardingFields: ambos nombres en la misma petición -> error en ambos', () => {
  const errors = validateOnboardingFields({ person_name: 'Juan Pérez', organization_name: 'ONG X' });
  assert.equal(errors.person_name, 'both_names_provided');
  assert.equal(errors.organization_name, 'both_names_provided');
});

test('validateOnboardingFields: teléfono usa el country_code del propio payload', () => {
  const errors = validateOnboardingFields({ phone: '859904311', country_code: 'CL' });
  assert.equal(errors.phone, 'invalid_phone');
  assert.deepEqual(validateOnboardingFields({ phone: '959904311', country_code: 'CL' }), {});
});

test('validateOnboardingFields: adult_declared=true es válido; cualquier otro valor no', () => {
  assert.deepEqual(validateOnboardingFields({ adult_declared: true }), {});
  assert.equal(validateOnboardingFields({ adult_declared: false }).adult_declared, 'adult_declaration_required');
});

test('validateOnboardingFields: terms_accepted/privacy_accepted true es válido; cualquier otro valor no', () => {
  assert.deepEqual(validateOnboardingFields({ terms_accepted: true }), {});
  assert.equal(validateOnboardingFields({ terms_accepted: 'si' }).terms_accepted, 'terms_not_accepted');
  assert.deepEqual(validateOnboardingFields({ privacy_accepted: true }), {});
  assert.equal(validateOnboardingFields({ privacy_accepted: 0 }).privacy_accepted, 'privacy_not_accepted');
});

// ---- isOnboardingComplete / missingOnboardingFields ----

const COMPLETE_PERSON_RECORD = {
  person_name: 'Juan Pérez',
  organization_name: null,
  phone: '+56959904311',
  country_code: 'CL',
  adult_declared: true,
  adult_declaration_version: CURRENT_ADULT_DECLARATION_VERSION,
  terms_version: CURRENT_TERMS_VERSION,
  terms_accepted_at: '2026-08-27T00:00:00.000Z',
  privacy_version: CURRENT_PRIVACY_VERSION,
  privacy_accepted_at: '2026-08-27T00:00:00.000Z',
};

test('isOnboardingComplete: registro de persona completo -> true', () => {
  assert.equal(isOnboardingComplete(COMPLETE_PERSON_RECORD), true);
});

test('isOnboardingComplete: registro de organización completo -> true', () => {
  const record = { ...COMPLETE_PERSON_RECORD, person_name: null, organization_name: 'ONG Fixture Real' };
  assert.equal(isOnboardingComplete(record), true);
});

test('isOnboardingComplete: ningún nombre lleno -> false', () => {
  assert.equal(isOnboardingComplete({ ...COMPLETE_PERSON_RECORD, person_name: null }), false);
});

test('isOnboardingComplete: ambos nombres llenos (estado inválido) -> false', () => {
  assert.equal(isOnboardingComplete({ ...COMPLETE_PERSON_RECORD, organization_name: 'ONG X' }), false);
});

test('isOnboardingComplete: adult_declared=false -> false, nunca se infiere de otro campo', () => {
  assert.equal(isOnboardingComplete({ ...COMPLETE_PERSON_RECORD, adult_declared: false }), false);
});

test('isOnboardingComplete: adult_declaration_version desactualizada -> false', () => {
  assert.equal(isOnboardingComplete({ ...COMPLETE_PERSON_RECORD, adult_declaration_version: 'adult-declaration-v0.1' }), false);
});

test('isOnboardingComplete: versión de términos desactualizada -> false', () => {
  assert.equal(isOnboardingComplete({ ...COMPLETE_PERSON_RECORD, terms_version: 'terms-v0.1' }), false);
});

test('isOnboardingComplete: registro null -> false, nunca lanza', () => {
  assert.equal(isOnboardingComplete(null), false);
});

test('missingOnboardingFields: registro vacío devuelve los 5 campos', () => {
  const missing = missingOnboardingFields({});
  assert.deepEqual(missing.sort(), ['adult_declared', 'identity_name', 'phone', 'privacy_accepted', 'terms_accepted'].sort());
});

test('missingOnboardingFields: registro completo devuelve lista vacía', () => {
  assert.deepEqual(missingOnboardingFields(COMPLETE_PERSON_RECORD), []);
});

test('missingOnboardingFields: solo reporta lo que realmente falta', () => {
  const partial = { ...COMPLETE_PERSON_RECORD, phone: null };
  assert.deepEqual(missingOnboardingFields(partial), ['phone']);
});
