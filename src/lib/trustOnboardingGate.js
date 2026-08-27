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
import { createClient } from '@supabase/supabase-js';
import { isOnboardingComplete, missingOnboardingFields } from './trustOnboardingPolicy.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const USER_MESSAGE = 'Antes de continuar, completa tu registro en Rifex.';

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

  const { data: record, error } = await supabase
    .from('trust_onboarding')
    .select('legal_name, birth_date, phone, account_type, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at, onboarding_completed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Fail-closed: un error de infraestructura al resolver Trust nunca
    // debe traducirse en "autorizado por defecto" — a diferencia del
    // fail-open deliberado de rate limiting (que protege contra abuso,
    // no contra omisión de un requisito legal/de producto).
    console.error('[trustOnboardingGate] error resolviendo onboarding:', error.message);
    return { ok: false, reason: 'onboarding_check_failed', message: USER_MESSAGE };
  }

  if (!record || !isOnboardingComplete(record)) {
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
    .select('legal_name, birth_date, phone, account_type, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at, onboarding_completed_at, created_at, updated_at')
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
 * Idempotente: coalesce conserva la fecha original de la primera vez
 * que se completó, mismo patrón que mark_event_order_paid
 * (paid_at = coalesce(paid_at, now())).
 */
export async function upsertOnboardingFields(userId, fields) {
  if (!userId) throw new Error('missing_user_id');

  const patch = { user_id: userId, updated_at: new Date().toISOString() };
  if (fields.legal_name !== undefined) patch.legal_name = fields.legal_name;
  if (fields.birth_date !== undefined) patch.birth_date = fields.birth_date;
  if (fields.phone !== undefined) patch.phone = fields.phone;
  if (fields.account_type !== undefined) patch.account_type = fields.account_type;
  if (fields.terms_version !== undefined) {
    patch.terms_version = fields.terms_version;
    patch.terms_accepted_at = fields.terms_accepted_at;
  }
  if (fields.privacy_version !== undefined) {
    patch.privacy_version = fields.privacy_version;
    patch.privacy_accepted_at = fields.privacy_accepted_at;
  }

  const { data: upserted, error: upsertErr } = await supabase
    .from('trust_onboarding')
    .upsert(patch, { onConflict: 'user_id' })
    .select('legal_name, birth_date, phone, account_type, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at, onboarding_completed_at')
    .single();
  if (upsertErr) throw upsertErr;

  const nowComplete = isOnboardingComplete(upserted);
  if (nowComplete && !upserted.onboarding_completed_at) {
    const { data: completed, error: completeErr } = await supabase
      .from('trust_onboarding')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('legal_name, birth_date, phone, account_type, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at, onboarding_completed_at')
      .single();
    if (completeErr) throw completeErr;
    return completed;
  }

  return upserted;
}

export { isOnboardingComplete, missingOnboardingFields };
