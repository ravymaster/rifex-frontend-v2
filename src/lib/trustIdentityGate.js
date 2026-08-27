// src/lib/trustIdentityGate.js
// TRUST-2 — autoridad server-side real de "¿este usuario puede crear,
// publicar, recaudar o administrar una iniciativa como creador?".
// Superset estricto de assertOnboardingComplete (TRUST-1): además exige
// que la declaración de mayoría de edad esté vigente, y —solo para
// Chile— un RUT con formato/dígito verificador válido ya declarado.
// Mismo patrón que countryGate.js/trustOnboardingGate.js: la decisión
// pura vive en trustIdentityPolicy.js/trustOnboardingPolicy.js, acá solo
// se resuelve contra la fila real de trust_onboarding y
// users_profile.country_code — nunca lo que el cliente afirme.
//
// age_verified/identity_verified ahora SÍ son columnas reales en
// trust_onboarding (agregadas por TRUST-3A, db/migrations/
// 2026-08-27b_trust3a_identity_verification.sql) — pero el ÚNICO código
// que puede escribirlas es la aprobación administrativa en
// src/lib/trustIdentityVerificationGate.js (recordDecision). Este
// archivo solo las LEE, nunca las escribe. phone_verified sigue sin
// existir (TRUST-3A no implementa verificación de teléfono).
//
// Corrección canónica (2026-08-27) — Mercado Pago como control
// principal: el cierre real del onboarding ahora exige ADEMÁS una
// cuenta de Mercado Pago conectada cuyo titular coincida con el RUT
// declarado en Rifex (mp_identity_match === 'matched'). Ver
// src/lib/mpIdentityMatchGate.js para la resolución real de ese estado
// — este archivo solo LEE el resultado ya persistido, nunca vuelve a
// consultar Mercado Pago por su cuenta.
//
// isIdentityVerificationRequiredForCreators() (trustIdentityVerification
// Policy.js) sigue en `false` — TRUST-3A permanece como respaldo
// excepcional, nunca el flujo normal.
import { createClient } from '@supabase/supabase-js';
import { isOnboardingComplete } from './trustOnboardingPolicy.js';
import {
  isValidRut,
  normalizeRut,
  maskRut,
  isRutRequiredForCountry,
  ageRequirementMetFromDeclaredData,
} from './trustIdentityPolicy.js';
import { isIdentityVerificationRequiredForCreators } from './trustIdentityVerificationPolicy.js';
import { isMercadoPagoMatchRequiredForCountry } from './mpIdentityMatchPolicy.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const USER_MESSAGE = {
  onboarding_incomplete: 'Antes de continuar, completa tu registro en Rifex.',
  onboarding_check_failed: 'Antes de continuar, completa tu registro en Rifex.',
  identity_incomplete: 'Antes de continuar, completa tu RUT en tu registro de Rifex.',
  identity_check_failed: 'Antes de continuar, completa tu registro en Rifex.',
  mp_not_connected: 'Antes de continuar, conecta tu cuenta de Mercado Pago en Rifex.',
  mp_identity_mismatch: 'No pudimos validar tu cuenta de Mercado Pago. Revisa tus datos o conecta una cuenta que te pertenezca.',
  mp_check_pending: 'Estamos validando tu cuenta de Mercado Pago. Intenta de nuevo en unos segundos.',
};

const ONBOARDING_COLUMNS =
  'person_name, organization_name, account_type, phone, adult_declared, adult_declaration_version, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at, onboarding_completed_at, rut_normalized, rut_declared_at, identity_verified, age_verified';

function fetchOnboardingRecord(userId) {
  return supabase.from('trust_onboarding').select(ONBOARDING_COLUMNS).eq('user_id', userId).maybeSingle();
}

async function fetchCountryCode(userId) {
  const { data } = await supabase.from('users_profile').select('country_code').eq('user_id', userId).maybeSingle();
  return data?.country_code ?? null;
}

async function fetchMpMatchState(userId) {
  const { data } = await supabase
    .from('merchant_gateways')
    .select('status, revoked_at, mp_identity_match')
    .eq('user_id', userId)
    .eq('provider', 'mp')
    .maybeSingle();
  return data;
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

  // isOnboardingComplete ya exige adult_declared === true (con la
  // versión vigente) como parte de "completo" — a diferencia del
  // antiguo modelo con birth_date, ya no existe un estado real de
  // "onboarding completo pero declarado menor de edad": completar el
  // registro implica haber declarado ser mayor de 18. No hay, por lo
  // tanto, un chequeo de edad separado acá — sería inalcanzable.
  if (!record || !isOnboardingComplete(record)) {
    return { ok: false, reason: 'onboarding_incomplete', message: USER_MESSAGE.onboarding_incomplete };
  }

  const countryCode = await fetchCountryCode(userId);
  if (isRutRequiredForCountry(countryCode)) {
    if (!record.rut_normalized || !isValidRut(record.rut_normalized)) {
      return { ok: false, reason: 'identity_incomplete', message: USER_MESSAGE.identity_incomplete };
    }
  }

  // Mercado Pago como control principal (decisión canónica 2026-08-27):
  // mientras esté disponible para el país, cierra el onboarding.
  if (isMercadoPagoMatchRequiredForCountry(countryCode)) {
    const mp = await fetchMpMatchState(userId);
    if (!mp || mp.revoked_at || mp.status !== 'connected') {
      return { ok: false, reason: 'mp_not_connected', message: USER_MESSAGE.mp_not_connected };
    }
    if (mp.mp_identity_match === 'mismatch' || mp.mp_identity_match === 'needs_review') {
      return { ok: false, reason: 'mp_identity_mismatch', message: USER_MESSAGE.mp_identity_mismatch };
    }
    if (mp.mp_identity_match === 'checking' || mp.mp_identity_match === 'not_connected') {
      return { ok: false, reason: 'mp_check_pending', message: USER_MESSAGE.mp_check_pending };
    }
    // 'matched' -> ok. 'unavailable' -> MP no entregó el dato para
    // confirmar/descartar (ver mpIdentityMatchGate.js) — no bloquea,
    // per mandato explícito de esta misión ("no bloquear todo el
    // trabajo restante" cuando el dato no está disponible).
  }

  // TRUST-3A: apagado por defecto (ver cabecera). Cuando se active
  // explícitamente, exige además una verificación documental aprobada
  // real — nunca un booleano que el propio usuario pudo haber escrito.
  if (isIdentityVerificationRequiredForCreators() && !record.identity_verified) {
    return {
      ok: false,
      reason: 'identity_verification_required',
      message: 'Antes de continuar, verifica tu identidad con un documento en Rifex.',
    };
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
 *
 * Corrección canónica: cambiar el RUT invalida cualquier coincidencia
 * de Mercado Pago ya calculada (Fase 5, punto 8) — se revalida en la
 * siguiente consulta de estado, nunca se asume que sigue vigente.
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
  // durante TRUST-2.
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

  // El RUT cambió: cualquier match de Mercado Pago previo queda
  // invalidado — nunca se asume que sigue siendo correcto contra un RUT
  // distinto. Best-effort: si esta fila no existe todavía (MP nunca se
  // conectó), no hay nada que invalidar.
  await supabase
    .from('merchant_gateways')
    .update({ mp_identity_match: 'not_connected', mp_identity_matched_at: null, mp_identity_match_reason: null })
    .eq('user_id', userId)
    .eq('provider', 'mp')
    .not('mp_identity_match', 'is', null);

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
  const ageMet = ageRequirementMetFromDeclaredData(record);
  const onboardingComplete = Boolean(record && isOnboardingComplete(record));

  const mpRequired = isMercadoPagoMatchRequiredForCountry(countryCode);
  let mpOk = !mpRequired;
  if (mpRequired) {
    const mp = await fetchMpMatchState(userId);
    mpOk = Boolean(mp && !mp.revoked_at && mp.status === 'connected' && (mp.mp_identity_match === 'matched' || mp.mp_identity_match === 'unavailable'));
  }

  return {
    rut_required: rutRequired,
    rut_declared: rutDeclared,
    rut_masked: rutDeclared ? maskRut(record.rut_normalized) : null,
    age_requirement_met_from_declared_data: ageMet,
    // age_verified/identity_verified: reales desde TRUST-3A, pero SOLO
    // legibles acá — la única escritura posible es la aprobación
    // administrativa en trustIdentityVerificationGate.js. phone_verified
    // sigue sin existir (TRUST-3A no verifica teléfono).
    age_verified: Boolean(record?.age_verified),
    identity_verified: Boolean(record?.identity_verified),
    phone_verified: false,
    // Mismo criterio exacto que assertCreatorEligible — si algún día
    // isIdentityVerificationRequiredForCreators() pasa a `true`, este
    // valor debe reflejarlo de inmediato, nunca quedar desincronizado
    // del gate real.
    creator_eligible:
      onboardingComplete &&
      ageMet &&
      (!rutRequired || rutDeclared) &&
      mpOk &&
      (!isIdentityVerificationRequiredForCreators() || Boolean(record?.identity_verified)),
  };
}

export { isOnboardingComplete };
