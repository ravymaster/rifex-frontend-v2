// src/lib/trustIdentityGate.js
// TRUST-2 — autoridad server-side real de "¿este usuario puede crear,
// publicar, recaudar o administrar una iniciativa como creador?".
// Superset estricto de assertOnboardingComplete (TRUST-1): además exige
// que la fecha de nacimiento declarada implique 18+, y —solo para
// Chile— un RUT con formato/dígito verificador válido ya declarado.
// Mismo patrón que countryGate.js/trustOnboardingGate.js: la decisión
// pura vive en trustIdentityPolicy.js/trustOnboardingPolicy.js, acá solo
// se resuelve contra la fila real de trust_onboarding y
// users_profile.country_code — nunca lo que el cliente afirme.
//
// age_verified/identity_verified/phone_verified NO existen como columnas
// en esta fase — se devuelven como constantes `false` desde
// getIdentityStatus, precisamente para que ningún código de TRUST-2
// pueda escribirlas por error. TRUST-3+ las reemplazará por columnas
// reales cuando exista una verificación de verdad (documento, SMS, etc.).
import { createClient } from '@supabase/supabase-js';
import { isOnboardingComplete } from './trustOnboardingPolicy.js';
import {
  isValidRut,
  normalizeRut,
  maskRut,
  isRutRequiredForCountry,
  ageRequirementMetFromDeclaredData,
} from './trustIdentityPolicy.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const USER_MESSAGE = {
  onboarding_incomplete: 'Antes de continuar, completa tu registro en Rifex.',
  onboarding_check_failed: 'Antes de continuar, completa tu registro en Rifex.',
  age_requirement_not_met: 'Debes ser mayor de 18 años para crear o publicar iniciativas en Rifex.',
  identity_incomplete: 'Antes de continuar, completa tu RUT en tu registro de Rifex.',
  identity_check_failed: 'Antes de continuar, completa tu registro en Rifex.',
};

const ONBOARDING_COLUMNS =
  'legal_name, birth_date, phone, account_type, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at, onboarding_completed_at, rut_normalized, rut_declared_at';

function fetchOnboardingRecord(userId) {
  return supabase.from('trust_onboarding').select(ONBOARDING_COLUMNS).eq('user_id', userId).maybeSingle();
}

async function fetchCountryCode(userId) {
  const { data } = await supabase.from('users_profile').select('country_code').eq('user_id', userId).maybeSingle();
  return data?.country_code ?? null;
}

/**
 * userId: SIEMPRE el id resuelto server-side desde una sesión verificada
 * (supabase.auth.getUser(token)) — nunca un id que llegue directo del
 * body/query de la request en curso. Mismo criterio que
 * assertOnboardingComplete(userId)/assertCountryGate(userId, capability).
 * @returns {Promise<{ok:true}|{ok:false, reason:string, message:string}>}
 */
export async function assertCreatorEligible(userId) {
  if (!userId) {
    return { ok: false, reason: 'onboarding_incomplete', message: USER_MESSAGE.onboarding_incomplete };
  }

  const { data: record, error } = await fetchOnboardingRecord(userId);
  if (error) {
    // Fail-closed, mismo criterio que assertOnboardingComplete: un error
    // de infraestructura nunca se traduce en "autorizado por defecto".
    console.error('[trustIdentityGate] error resolviendo onboarding:', error.message);
    return { ok: false, reason: 'onboarding_check_failed', message: USER_MESSAGE.onboarding_check_failed };
  }

  if (!record || !isOnboardingComplete(record)) {
    return { ok: false, reason: 'onboarding_incomplete', message: USER_MESSAGE.onboarding_incomplete };
  }

  if (!ageRequirementMetFromDeclaredData(record.birth_date)) {
    return { ok: false, reason: 'age_requirement_not_met', message: USER_MESSAGE.age_requirement_not_met };
  }

  const countryCode = await fetchCountryCode(userId);
  if (isRutRequiredForCountry(countryCode)) {
    if (!record.rut_normalized || !isValidRut(record.rut_normalized)) {
      return { ok: false, reason: 'identity_incomplete', message: USER_MESSAGE.identity_incomplete };
    }
  }

  return { ok: true };
}

/**
 * Guarda el RUT declarado del usuario autenticado. Nunca acepta un
 * estado "verificado" como parámetro — solo el RUT crudo, validado y
 * normalizado acá mismo antes de tocar la base.
 *
 * Duplicidad: un índice único parcial en rut_normalized (ver migración
 * TRUST-2) rechaza que dos cuentas distintas declaren el mismo RUT. El
 * conflicto se traduce a 'rut_conflict' sin revelar a quién pertenece
 * el RUT ya declarado — nunca un nombre, email ni id de otra cuenta.
 */
export async function upsertIdentityRut(userId, rawRut) {
  if (!userId) throw new Error('missing_user_id');
  if (!isValidRut(rawRut)) {
    return { ok: false, reason: 'invalid_rut' };
  }
  const normalized = normalizeRut(rawRut);

  // upsert, NUNCA update: un usuario puede llamar este endpoint antes de
  // haber completado /api/onboarding/trust/complete (por ejemplo,
  // llamando la API directo, fuera de orden) — con `.update()` eso
  // fallaría en silencio (0 filas afectadas, sin error) porque todavía
  // no existiría ninguna fila en trust_onboarding para ese user_id,
  // dejando creer al cliente que el RUT quedó guardado cuando en
  // realidad no se escribió nada. Detectado adversarialmente en DEV
  // durante esta misma fase (ver checkpoint de cierre TRUST-2).
  const { error } = await supabase
    .from('trust_onboarding')
    .upsert(
      {
        user_id: userId,
        rut_normalized: normalized,
        rut_declared_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    if (error.code === '23505') {
      return { ok: false, reason: 'rut_conflict' };
    }
    throw error;
  }

  return { ok: true, rut_masked: maskRut(normalized) };
}

/**
 * Resuelve el estado de identidad TRUST-2 del usuario autenticado, para
 * GET /api/onboarding/trust/status. Nunca incluye el RUT completo — solo
 * la versión enmascarada — ni datos de otro usuario.
 */
export async function getIdentityStatus(userId) {
  if (!userId) {
    return {
      rut_required: false,
      rut_declared: false,
      rut_masked: null,
      age_requirement_met_from_declared_data: false,
      age_verified: false,
      identity_verified: false,
      phone_verified: false,
      creator_eligible: false,
    };
  }

  const [{ data: record, error }, countryCode] = await Promise.all([
    fetchOnboardingRecord(userId),
    fetchCountryCode(userId),
  ]);
  if (error) {
    console.error('[trustIdentityGate] error leyendo identidad:', error.message);
  }

  const rutRequired = isRutRequiredForCountry(countryCode);
  const rutDeclared = Boolean(record?.rut_normalized);
  const ageMet = ageRequirementMetFromDeclaredData(record?.birth_date);
  const onboardingComplete = Boolean(record && isOnboardingComplete(record));

  return {
    rut_required: rutRequired,
    rut_declared: rutDeclared,
    rut_masked: rutDeclared ? maskRut(record.rut_normalized) : null,
    age_requirement_met_from_declared_data: ageMet,
    // TRUST-2 nunca persiste ni calcula estos tres — siempre `false`
    // hasta que una fase posterior implemente una verificación real.
    age_verified: false,
    identity_verified: false,
    phone_verified: false,
    creator_eligible: onboardingComplete && ageMet && (!rutRequired || rutDeclared),
  };
}

export { isOnboardingComplete };
