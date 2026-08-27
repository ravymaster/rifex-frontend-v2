// tests/trustIdentityPolicy.test.mjs
// TRUST-2 — validación pura de identidad básica declarada (RUT chileno)
// y del requisito de edad para crear. Sin Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanRut,
  isValidRut,
  validateRut,
  normalizeRut,
  maskRut,
  isRutRequiredForCountry,
  ageRequirementMetFromDeclaredData,
} from '../src/lib/trustIdentityPolicy.js';
import { CURRENT_ADULT_DECLARATION_VERSION } from '../src/lib/trustOnboardingPolicy.js';

// ---- RUT: formatos válidos reales (verificados por cálculo del dígito
// verificador módulo 11, no solo copiados de un ejemplo) ----

test('isValidRut: acepta el mismo RUT con puntos, sin puntos, con guion, con espacios', () => {
  assert.equal(isValidRut('14.182.309-4'), true);
  assert.equal(isValidRut('14182309-4'), true);
  assert.equal(isValidRut('141823094'), true);
  assert.equal(isValidRut('14182309 4'), true);
  assert.equal(isValidRut(' 14.182.309-4 '), true);
});

test('isValidRut: acepta K mayúscula y minúscula como dígito verificador', () => {
  assert.equal(isValidRut('1000005-K'), true);
  assert.equal(isValidRut('1000005-k'), true);
  assert.equal(isValidRut('1000019-K'), true);
});

test('isValidRut: acepta dígito verificador 0 (resto 11 del módulo 11)', () => {
  assert.equal(isValidRut('2000009-0'), true);
  assert.equal(isValidRut('2000012-0'), true);
});

test('isValidRut: rechaza dígito verificador incorrecto', () => {
  assert.equal(isValidRut('14.182.309-5'), false); // el real es -4
  assert.equal(isValidRut('1000005-0'), false); // el real es -K
  assert.equal(isValidRut('11.111.111-2'), false); // el real es -1
});

test('isValidRut: rechaza formato inválido (letras en el cuerpo, vacío, basura)', () => {
  assert.equal(isValidRut('abc-4'), false);
  assert.equal(isValidRut(''), false);
  assert.equal(isValidRut('bad'), false);
  assert.equal(isValidRut(null), false);
  assert.equal(isValidRut(undefined), false);
});

test('isValidRut: rechaza cuerpo demasiado corto o demasiado largo', () => {
  assert.equal(isValidRut('123-4'), false); // muy corto para ser un RUT real
  assert.equal(isValidRut('123456789012-4'), false); // muy largo
});

test('validateRut: código de error estable, nunca un mensaje libre', () => {
  assert.equal(validateRut(''), 'rut_required');
  assert.equal(validateRut('   '), 'rut_required');
  assert.equal(validateRut(undefined), 'rut_required');
  assert.equal(validateRut('14.182.309-5'), 'invalid_rut');
  assert.equal(validateRut('14.182.309-4'), null);
});

test('normalizeRut: misma forma canónica sin importar cómo se ingresó', () => {
  assert.equal(normalizeRut('14.182.309-4'), '141823094');
  assert.equal(normalizeRut('14182309-4'), '141823094');
  assert.equal(normalizeRut('14182309 4'), '141823094');
  assert.equal(normalizeRut('1000005-k'), '1000005K');
});

test('maskRut: conserva solo los últimos 4 caracteres, nunca el RUT completo', () => {
  assert.equal(maskRut('141823094'), '*****3094');
  assert.equal(maskRut('1000005K'), '****005K');
  assert.equal(maskRut(null), null);
  assert.equal(maskRut(''), null);
});

test('isRutRequiredForCountry: solo Chile, en esta fase', () => {
  assert.equal(isRutRequiredForCountry('CL'), true);
  assert.equal(isRutRequiredForCountry('AR'), false);
  assert.equal(isRutRequiredForCountry('BR'), false);
  assert.equal(isRutRequiredForCountry(null), false);
  assert.equal(isRutRequiredForCountry(undefined), false);
});

// ---- Requisito de edad para crear (18+), declarado, nunca verificado ----
// Corrección canónica (2026-08-27): ya no hay fecha de nacimiento —
// ageRequirementMetFromDeclaredData ahora lee directo un registro con
// adult_declared (booleano) + adult_declaration_version (debe ser la
// vigente), nunca calcula nada desde una fecha.

test('ageRequirementMetFromDeclaredData: adult_declared=true con versión vigente -> true', () => {
  assert.equal(
    ageRequirementMetFromDeclaredData({ adult_declared: true, adult_declaration_version: CURRENT_ADULT_DECLARATION_VERSION }),
    true
  );
});

test('ageRequirementMetFromDeclaredData: adult_declared=false -> false, sin importar la versión', () => {
  assert.equal(
    ageRequirementMetFromDeclaredData({ adult_declared: false, adult_declaration_version: CURRENT_ADULT_DECLARATION_VERSION }),
    false
  );
});

test('ageRequirementMetFromDeclaredData: adult_declared=true pero con una versión vieja de la declaración -> false', () => {
  assert.equal(
    ageRequirementMetFromDeclaredData({ adult_declared: true, adult_declaration_version: 'adult-declaration-v0.1' }),
    false
  );
});

test('ageRequirementMetFromDeclaredData: registro vacío o ausente -> false, nunca lanza', () => {
  assert.equal(ageRequirementMetFromDeclaredData({}), false);
  assert.equal(ageRequirementMetFromDeclaredData(undefined), false);
  assert.equal(ageRequirementMetFromDeclaredData(null), false);
});

test('cleanRut: función de limpieza expuesta produce la misma forma que normalizeRut', () => {
  assert.equal(cleanRut('14.182.309-4'), normalizeRut('14.182.309-4'));
});
