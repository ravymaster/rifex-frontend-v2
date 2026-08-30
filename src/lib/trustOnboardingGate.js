// src/lib/trustOnboardingGate.js
// TRUST-1 — autoridad server-side real de "¿este usuario completó el
// onboarding universal?". Mismo criterio que src/lib/countryGate.js: la
// decisión pura vive en trustOnboardingPolicy.js, acá solo se resuelve
// el estado REAL contra trust_onboarding (nunca lo que el cliente
// afirme) y se traduce a algo seguro de responder por HTTP.
//
// trust_onboarding tiene RLS default-deny total (revoke all from
// public, anon, authenticated) — este módulo es, junto con las rutas de
// src/pages/api/onboarding/trust/*.js, el ÚNICO código autorizado para
// tocar esa tabla, siempre vía service_role.
//
// Corrección canónica (2026-08-27): person_name/organization_name
// reemplazan legal_name+account_type — account_type sigue existiendo
// como columna, pero SOLO este módulo lo escribe, siempre derivado
// server-side de cuál de los dos nombres está lleno (nunca un valor que
// mande el cliente). adult_declared/adult_declaration_version
// reemplazan birth_date por completo — ver trustOnboardingPolicy.js.
import { createClient } from '@supabase/supabase-js';
import {
  isOnboardingComplete,
  missingOnboardingFields,
  deriveAccountType,
  normalizePhone,
} from './trustOnboardingPolicy.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const USER_MESSAGE = 'Antes de continuar, completa tu registro en Rifex.';

const ONBOARDING_COLUMNS =
  'person_name, organization_name, account_type, phone, adult_declared, adult_declaration_version, adult_declared_at, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at, onboarding_completed_at';

async function fetchCountryCode(userId) {
  const { data } = await supabase.from('users_profile').select('country_code').eq('user_id', userId).maybeSingle();
  return data?.country_code ?? null;
}

/**
 * userId: SIEMPRE el id resuelto server-side desde una sesión verificada
 * (supabase.auth.getUser(token)) — nunca un id que llegue directo del
 * body/query de la request en curso. Mismo criterio que
 * assertCountryGate(userId, capability).
 * @returns {Promise<{ok: true} | {ok: false, reason: string, message: string}>}
 */
export async function assertOnboardingComplete(userId) {
  if (!userId) {
    return { ok: false, reason: 'onboarding_incomplete', message: USER_MESSAGE };
  }

  const [{ data: record, error }, countryCode] = await Promise.all([
    supabase.from('trust_onboarding').select(ONBOARDING_COLUMNS).eq('user_id', userId).maybeSingle(),
    fetchCountryCode(userId),
  ]);

  if (error) {
    // Fail-closed: un error de infraestructura al resolver Trust nunca
    // debe traducirse en "autorizado por defecto" — a diferencia del
    // fail-open deliberado de rate limiting (que protege contra abuso,
    // no contra omisión de un requisito legal/de producto).
    console.error('[trustOnboardingGate] error resolviendo onboarding:', error.message);
    return { ok: false, reason: 'onboarding_check_failed', message: USER_MESSAGE };
  }

  if (!record || !isOnboardingComplete({ ...record, country_code: countryCode })) {
    return { ok: false, reason: 'onboarding_incomplete', message: USER_MESSAGE };
  }

  return { ok: true };
}

/**
 * Resuelve el registro completo (para GET /api/onboarding/trust/status)
 * — nunca incluye campos que no existan en la tabla, nunca incluye
 * datos de otro usuario (siempre acotado por user_id exacto).
 */
export async function getOnboardingRecord(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('trust_onboarding')
    .select(`${ONBOARDING_COLUMNS}, created_at, updated_at`)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[trustOnboardingGate] error leyendo registro:', error.message);
    return null;
  }
  return data;
}

/**
 * Upsert de los campos base — NUNCA acepta onboarding_completed_at como
 * parámetro de entrada. completed_at se calcula siempre acá, desde el
 * resultado real tras el upsert, con isOnboardingComplete — nunca
 * confiado a lo que el cliente afirme haber completado.
 *
 * account_type NUNCA se acepta como entrada — se deriva acá mismo,
 * server-side, de cuál de person_name/organization_name termina lleno
 * en el registro resultante (fusionando lo ya existente con este
 * patch), nunca de un valor que mande el cliente.
 *
 * phone se normaliza acá con el country_code real del usuario (nunca
 * uno que mande el cliente) antes de guardarse.
 *
 * Idempotente: coalesce conserva la fecha original de la primera vez
 * que se completó, mismo patrón que mark_event_order_paid
 * (paid_at = coalesce(paid_at, now())).
 */
export async function upsertOnboardingFields(userId, fields) {
  if (!userId) throw new Error('missing_user_id');

  const [{ data: existing }, countryCode] = await Promise.all([
    supabase.from('trust_onboarding').select(ONBOARDING_COLUMNS).eq('user_id', userId).maybeSingle(),
    fetchCountryCode(userId),
  ]);

  const patch = { user_id: userId, updated_at: new Date().toISOString() };
  if (fields.person_name !== undefined) patch.person_name = fields.person_name || null;
  if (fields.organization_name !== undefined) patch.organization_name = fields.organization_name || null;
  if (fields.phone !== undefined) patch.phone = fields.phone ? normalizePhone(fields.phone, countryCode) : null;
  if (fields.adult_declared !== undefined) {
    patch.adult_declared = fields.adult_declared;
    patch.adult_declaration_version = fields.adult_declaration_version;
    patch.adult_declared_at = new Date().toISOString();
  }
  if (fields.terms_version !== undefined) {
    patch.terms_version = fields.terms_version;
    patch.terms_accepted_at = fields.terms_accepted_at;
  }
  if (fields.privacy_version !== undefined) {
    patch.privacy_version = fields.privacy_version;
    patch.privacy_accepted_at = fields.privacy_accepted_at;
  }

  // account_type siempre derivado del estado RESULTANTE (lo ya guardado
  // fusionado con este patch) — nunca de lo que mande el cliente.
  const resultingNames = {
    person_name: patch.person_name !== undefined ? patch.person_name : existing?.person_name,
    organization_name: patch.organization_name !== undefined ? patch.organization_name : existing?.organization_name,
  };
  patch.account_type = deriveAccountType(resultingNames);

  const { data: upserted, error: upsertErr } = await supabase
    .from('trust_onboarding')
    .upsert(patch, { onConflict: 'user_id' })
    .select(ONBOARDING_COLUMNS)
    .single();
  if (upsertErr) throw upsertErr;

  const nowComplete = isOnboardingComplete({ ...upserted, country_code: countryCode });
  if (nowComplete && !upserted.onboarding_completed_at) {
    const { data: completed, error: completeErr } = await supabase
      .from('trust_onboarding')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select(ONBOARDING_COLUMNS)
      .single();
    if (completeErr) throw completeErr;
    return completed;
  }

  return upserted;
}

export { isOnboardingComplete, missingOnboardingFields };
