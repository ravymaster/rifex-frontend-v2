// src/lib/trustOnboardingPolicy.js
// TRUST-1 — validación pura del onboarding universal. Sin Supabase, sin
// I/O, mismo criterio que src/lib/countryPolicy.js (módulo puro,
// importable tanto desde cliente como desde API routes sin traer
// secretos). La autoridad real de "completo" vive acá y en
// src/lib/trustOnboardingGate.js (que persiste el resultado) — nunca en
// el cliente.
//
// Edad DECLARADA, nunca "verificada" — ver docs/trust/
// TRUST_AGE_IDENTITY_VERIFICATION.md. Este módulo solo valida que la
// fecha declarada sea plausible (rango razonable, no futura) y calcula
// si esa fecha implica 18+ — un dato derivado, nunca "identity_verified"
// ni "age_verified".

// Versión actual de los documentos que el usuario debe aceptar. Cambiar
// esta constante invalida las aceptaciones previas (el usuario deberá
// re-aceptar la próxima vez que se le pida completar/editar su
// onboarding) — es intencional: una aceptación versionada solo cuenta
// para la versión que efectivamente aceptó.
export const CURRENT_TERMS_VERSION = 'terms-v1.0';
export const CURRENT_PRIVACY_VERSION = 'privacy-v1.0';

export const ACCOUNT_TYPES = ['person', 'organization'];

const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,19}$/;
const MIN_LEGAL_NAME_LENGTH = 3;
const MAX_LEGAL_NAME_LENGTH = 140;

function isPlainString(v) {
  return typeof v === 'string';
}

/**
 * Valida un campo individual. Retorna null si es válido, o un código de
 * error estable (nunca un mensaje libre) si no lo es — el mensaje
 * legible para el usuario se resuelve en la capa de UI/API, no acá.
 */
export function validateLegalName(value) {
  if (!isPlainString(value)) return 'invalid_legal_name';
  const trimmed = value.trim();
  if (trimmed.length < MIN_LEGAL_NAME_LENGTH || trimmed.length > MAX_LEGAL_NAME_LENGTH) return 'invalid_legal_name';
  return null;
}

export function validateBirthDate(value) {
  if (!isPlainString(value)) return 'invalid_birth_date';
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return 'invalid_birth_date';
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (d.getTime() > todayUtc.getTime()) return 'birth_date_in_future';
  const minDate = new Date(Date.UTC(todayUtc.getUTCFullYear() - 120, todayUtc.getUTCMonth(), todayUtc.getUTCDate()));
  if (d.getTime() < minDate.getTime()) return 'birth_date_implausible';
  return null;
}

export function validatePhone(value) {
  if (!isPlainString(value)) return 'invalid_phone';
  if (!PHONE_PATTERN.test(value.trim())) return 'invalid_phone';
  return null;
}

export function validateAccountType(value) {
  if (!ACCOUNT_TYPES.includes(value)) return 'invalid_account_type';
  return null;
}

export function validateTermsAcceptance(version) {
  if (version !== CURRENT_TERMS_VERSION) return 'terms_not_accepted';
  return null;
}

export function validatePrivacyAcceptance(version) {
  if (version !== CURRENT_PRIVACY_VERSION) return 'privacy_not_accepted';
  return null;
}

/**
 * Calcula la edad declarada (en años completos) a partir de una fecha
 * 'YYYY-MM-DD' ya validada por validateBirthDate. Uso interno, nunca se
 * expone como "edad verificada".
 */
export function declaredAge(birthDateStr) {
  const d = new Date(`${birthDateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() >= d.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export function isDeclaredAdult(birthDateStr) {
  const age = declaredAge(birthDateStr);
  return age !== null && age >= 18;
}

/**
 * Valida el conjunto completo de campos enviados en un submit de
 * /api/onboarding/trust/complete. Retorna { errors: {campo: código} } —
 * un objeto vacío significa que todos los campos presentes son válidos
 * (no implica que estén TODOS presentes — eso lo decide
 * isOnboardingComplete por separado, ya que el formulario permite
 * guardar avance parcial).
 */
export function validateOnboardingFields(fields) {
  const errors = {};
  if (fields.legal_name !== undefined && fields.legal_name !== null) {
    const err = validateLegalName(fields.legal_name);
    if (err) errors.legal_name = err;
  }
  if (fields.birth_date !== undefined && fields.birth_date !== null) {
    const err = validateBirthDate(fields.birth_date);
    if (err) errors.birth_date = err;
  }
  if (fields.phone !== undefined && fields.phone !== null) {
    const err = validatePhone(fields.phone);
    if (err) errors.phone = err;
  }
  if (fields.account_type !== undefined && fields.account_type !== null) {
    const err = validateAccountType(fields.account_type);
    if (err) errors.account_type = err;
  }
  // terms_accepted/privacy_accepted que llegan del cliente son booleanos
  // de un checkbox — la versión real siempre la fija el servidor con la
  // constante vigente (ver complete.js), nunca el cliente. Acá solo se
  // valida la FORMA del valor (debe ser exactamente `true` para contar
  // como aceptación; cualquier otra cosa que no sea `undefined` es un
  // valor inválido) — la validación de que la VERSIÓN siga vigente vive
  // en isOnboardingComplete/missingOnboardingFields, comparando el
  // registro ya persistido contra CURRENT_TERMS_VERSION/
  // CURRENT_PRIVACY_VERSION.
  if (fields.terms_accepted !== undefined && fields.terms_accepted !== true) {
    errors.terms_accepted = 'terms_not_accepted';
  }
  if (fields.privacy_accepted !== undefined && fields.privacy_accepted !== true) {
    errors.privacy_accepted = 'privacy_not_accepted';
  }
  return errors;
}

/**
 * Determina si un registro (ya persistido, con la forma de la fila real
 * de trust_onboarding) cumple TODOS los requisitos para considerarse
 * onboarding completo. Nunca acepta "onboarding_completed_at" como
 * entrada — se calcula siempre desde los campos base, en cada llamada,
 * para que nunca pueda quedar desincronizado de la realidad.
 */
export function isOnboardingComplete(record) {
  if (!record) return false;
  return Boolean(
    record.legal_name && record.legal_name.trim().length >= MIN_LEGAL_NAME_LENGTH &&
    record.birth_date && !validateBirthDate(record.birth_date) &&
    record.phone && !validatePhone(record.phone) &&
    ACCOUNT_TYPES.includes(record.account_type) &&
    record.terms_version === CURRENT_TERMS_VERSION && record.terms_accepted_at &&
    record.privacy_version === CURRENT_PRIVACY_VERSION && record.privacy_accepted_at
  );
}

/**
 * Lista de campos que todavía faltan o son inválidos, para que la UI
 * pueda mostrar exactamente qué falta sin adivinar.
 */
export function missingOnboardingFields(record) {
  const missing = [];
  if (!record?.legal_name || validateLegalName(record.legal_name)) missing.push('legal_name');
  if (!record?.birth_date || validateBirthDate(record.birth_date)) missing.push('birth_date');
  if (!record?.phone || validatePhone(record.phone)) missing.push('phone');
  if (!record?.account_type || !ACCOUNT_TYPES.includes(record.account_type)) missing.push('account_type');
  if (record?.terms_version !== CURRENT_TERMS_VERSION || !record?.terms_accepted_at) missing.push('terms_accepted');
  if (record?.privacy_version !== CURRENT_PRIVACY_VERSION || !record?.privacy_accepted_at) missing.push('privacy_accepted');
  return missing;
}
