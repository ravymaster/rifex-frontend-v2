// src/lib/trustOnboardingPolicy.js
// TRUST-1 — validación pura del onboarding universal. Sin Supabase, sin
// I/O, mismo criterio que src/lib/countryPolicy.js (módulo puro,
// importable tanto desde cliente como desde API routes sin traer
// secretos). La autoridad real de "completo" vive acá y en
// src/lib/trustOnboardingGate.js (que persiste el resultado) — nunca en
// el cliente.
//
// Corrección canónica (2026-08-27, misión "onboarding MP como control
// principal"): Rodrigo decidió eliminar por completo la captura,
// almacenamiento, cálculo y presentación de fecha de nacimiento. Ya no
// existe `birth_date`, `declaredAge` ni `isDeclaredAdult` en este
// archivo — la mayoría de edad se declara como un checkbox versionado
// ("Declaro que soy mayor de 18 años"), nunca como una fecha ni una
// edad calculada. Esto NUNCA es `age_verified` — sigue siendo
// exclusivamente una declaración, igual que antes lo era la fecha.
// `age_verified` sigue existiendo solo como estado reservado del flujo
// excepcional TRUST-3A (revisión documental manual), fuera de este
// onboarding normal.
//
// También reemplaza el selector `account_type` por dos campos —
// `person_name`/`organization_name` — de los cuales exactamente uno
// debe estar completo. El `account_type` que el resto del código sigue
// usando (TRUST-2/TRUST-3A) ahora se DERIVA server-side de cuál de los
// dos campos tiene contenido, nunca de un valor que mande el cliente.

// Versión actual de los documentos que el usuario debe aceptar. Subida
// en esta misión (terms-v1.0 -> v1.1, privacy-v1.0 -> v1.1) porque el
// alcance real de datos recolectados cambió (se deja de pedir fecha de
// nacimiento, se agrega verificación de titularidad vía Mercado Pago) —
// cualquier aceptación previa queda invalidada y se re-pide la próxima
// vez que el usuario complete/edite su onboarding.
export const CURRENT_TERMS_VERSION = 'terms-v1.1';
export const CURRENT_PRIVACY_VERSION = 'privacy-v1.1';
export const CURRENT_ADULT_DECLARATION_VERSION = 'adult-declaration-v1.0';

export const ACCOUNT_TYPES = ['person', 'organization'];

const PHONE_PATTERN_GENERIC = /^\+?[0-9][0-9\s-]{6,19}$/;
const PHONE_CL_LOCAL_DIGITS = /^9[0-9]{8}$/; // 9 dígitos, siempre empieza en 9 (celular chileno)
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 140;

function isPlainString(v) {
  return typeof v === 'string';
}

function isNonEmptyTrimmed(v) {
  return isPlainString(v) && v.trim().length > 0;
}

/**
 * Valida un campo individual. Retorna null si es válido, o un código de
 * error estable (nunca un mensaje libre) si no lo es — el mensaje
 * legible para el usuario se resuelve en la capa de UI/API, no acá.
 */
export function validatePersonName(value) {
  if (!isPlainString(value)) return 'invalid_person_name';
  const trimmed = value.trim();
  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) return 'invalid_person_name';
  return null;
}

export function validateOrganizationName(value) {
  if (!isPlainString(value)) return 'invalid_organization_name';
  const trimmed = value.trim();
  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) return 'invalid_organization_name';
  return null;
}

/**
 * Regla autoritativa de Fase 2: exactamente uno de los dos nombres debe
 * estar presente. Nunca confía en un `account_type` que mande el
 * cliente — la clasificación se deriva de esto mismo (ver
 * deriveAccountType). Se evalúa contra el estado COMPLETO del registro
 * (no contra un PATCH parcial de un solo campo), así que un guardado
 * parcial que todavía deja el otro campo vacío no es un error todavía
 * — el error real solo se marca cuando ambos llegan simultáneamente no
 * vacíos en la MISMA petición (intento de colar los dos a la vez) o
 * cuando, al momento de completar el onboarding, ninguno quedó lleno.
 */
export function validateBothNamesNotProvidedTogether(fields) {
  const person = isNonEmptyTrimmed(fields.person_name);
  const org = isNonEmptyTrimmed(fields.organization_name);
  if (person && org) return 'both_names_provided';
  return null;
}

export function deriveAccountType({ person_name, organization_name } = {}) {
  const person = isNonEmptyTrimmed(person_name);
  const org = isNonEmptyTrimmed(organization_name);
  if (person && !org) return 'person';
  if (org && !person) return 'organization';
  return null; // ninguno, o ambos (estado inválido) -> sin clasificación
}

// Chile: el usuario solo escribe los 9 dígitos locales (siempre
// empiezan en 9) — el "+56" es fijo en la UI, nunca lo escribe. Otros
// países (hoy solo AR devOnly) usan el patrón genérico existente.
export function validatePhone(value, countryCode) {
  if (!isPlainString(value)) return 'invalid_phone';
  const trimmed = value.trim();
  if (countryCode === 'CL') {
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    // Acepta tanto los 9 dígitos locales (959904311) como el E.164 ya
    // normalizado (+56959904311), para no romper valores ya guardados.
    const local = digitsOnly.startsWith('56') && digitsOnly.length === 11 ? digitsOnly.slice(2) : digitsOnly;
    if (!PHONE_CL_LOCAL_DIGITS.test(local)) return 'invalid_phone';
    return null;
  }
  if (!PHONE_PATTERN_GENERIC.test(trimmed)) return 'invalid_phone';
  return null;
}

// Forma canónica de almacenamiento: E.164. Para Chile, siempre
// "+56" + 9 dígitos — nunca se guarda el valor "tal cual" el usuario
// lo escribió.
export function normalizePhone(value, countryCode) {
  const trimmed = String(value || '').trim();
  if (countryCode === 'CL') {
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    const local = digitsOnly.startsWith('56') && digitsOnly.length === 11 ? digitsOnly.slice(2) : digitsOnly;
    return `+56${local}`;
  }
  return trimmed;
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
 * Declaración de mayoría de edad — un checkbox versionado, nunca una
 * fecha ni un cálculo. "adult_declared=true" significa únicamente
 * "esta persona afirmó ser mayor de 18 años", jamás "age_verified".
 */
export function validateAdultDeclaration(value) {
  if (value !== true) return 'adult_declaration_required';
  return null;
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

  const bothProvided = validateBothNamesNotProvidedTogether(fields);
  if (bothProvided) {
    errors.person_name = bothProvided;
    errors.organization_name = bothProvided;
  } else {
    if (fields.person_name !== undefined && fields.person_name !== null && fields.person_name !== '') {
      const err = validatePersonName(fields.person_name);
      if (err) errors.person_name = err;
    }
    if (fields.organization_name !== undefined && fields.organization_name !== null && fields.organization_name !== '') {
      const err = validateOrganizationName(fields.organization_name);
      if (err) errors.organization_name = err;
    }
  }

  if (fields.phone !== undefined && fields.phone !== null) {
    const err = validatePhone(fields.phone, fields.country_code);
    if (err) errors.phone = err;
  }
  if (fields.adult_declared !== undefined) {
    const err = validateAdultDeclaration(fields.adult_declared);
    if (err) errors.adult_declared = err;
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
  const accountType = deriveAccountType(record);
  return Boolean(
    accountType &&
    (accountType === 'person'
      ? !validatePersonName(record.person_name)
      : !validateOrganizationName(record.organization_name)) &&
    record.phone && !validatePhone(record.phone, record.country_code) &&
    record.adult_declared === true && record.adult_declaration_version === CURRENT_ADULT_DECLARATION_VERSION &&
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
  const accountType = deriveAccountType(record || {});
  if (!accountType) {
    missing.push('identity_name');
  } else if (accountType === 'person' && validatePersonName(record.person_name)) {
    missing.push('identity_name');
  } else if (accountType === 'organization' && validateOrganizationName(record.organization_name)) {
    missing.push('identity_name');
  }
  if (!record?.phone || validatePhone(record.phone, record?.country_code)) missing.push('phone');
  if (record?.adult_declared !== true || record?.adult_declaration_version !== CURRENT_ADULT_DECLARATION_VERSION) missing.push('adult_declared');
  if (record?.terms_version !== CURRENT_TERMS_VERSION || !record?.terms_accepted_at) missing.push('terms_accepted');
  if (record?.privacy_version !== CURRENT_PRIVACY_VERSION || !record?.privacy_accepted_at) missing.push('privacy_accepted');
  return missing;
}
