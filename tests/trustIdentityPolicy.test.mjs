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
  MIN_CREATOR_AGE,
} from '../src/lib/trustIdentityPolicy.js';

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

test('ageRequirementMetFromDeclaredData: cumple 18 exactamente hoy -> true', () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const turns18Today = `${y - MIN_CREATOR_AGE}-${mm}-${dd}`;
  assert.equal(ageRequirementMetFromDeclaredData(turns18Today), true);
});

test('ageRequirementMetFromDeclaredData: cumplirá 18 recién mañana -> todavía false', () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const tomorrow = new Date(Date.UTC(y - MIN_CREATOR_AGE, now.getUTCMonth(), now.getUTCDate() + 1));
  const turns18Tomorrow = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
  assert.equal(ageRequirementMetFromDeclaredData(turns18Tomorrow), false);
});

test('ageRequirementMetFromDeclaredData: menor de edad declarado -> false', () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  assert.equal(ageRequirementMetFromDeclaredData(`${y - 10}-06-15`), false);
});

test('ageRequirementMetFromDeclaredData: adulto declarado, nacido en año bisiesto (29 feb) -> true tras haber cumplido', () => {
  // 2000 fue bisiesto — nacer un 29 de febrero es un caso real que debe
  // calcular sin lanzar y sin desfasarse un día.
  const now = new Date();
  const y = now.getUTCFullYear();
  // Ya deben haber pasado más de 18 años desde el 2000-02-29 en 2026+.
  assert.equal(ageRequirementMetFromDeclaredData('2000-02-29'), y - 2000 >= MIN_CREATOR_AGE);
});

test('ageRequirementMetFromDeclaredData: fecha inválida -> false, nunca lanza', () => {
  assert.equal(ageRequirementMetFromDeclaredData('no-es-una-fecha'), false);
  assert.equal(ageRequirementMetFromDeclaredData(undefined), false);
  assert.equal(ageRequirementMetFromDeclaredData(null), false);
});

test('cleanRut: función de limpieza expuesta produce la misma forma que normalizeRut', () => {
  assert.equal(cleanRut('14.182.309-4'), normalizeRut('14.182.309-4'));
});
