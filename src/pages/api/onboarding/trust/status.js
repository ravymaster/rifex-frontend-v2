// src/pages/api/onboarding/trust/status.js
// TRUST-1 — GET: estado real del onboarding universal del usuario
// autenticado. Nunca expone datos de otro usuario (siempre acotado por
// el id resuelto desde el token, nunca desde query/body). Usado tanto
// por /registro/continuar (para prellenar y mostrar progreso) como por
// el chequeo de redirect client-side (src/lib/trustOnboardingClient.js).
//
// Corrección canónica (2026-08-27): person_name/organization_name
// reemplazan legal_name+account_type; adult_declared reemplaza
// birth_date; se agrega el bloque `mp` (estado real de Mercado Pago,
// control principal que cierra el onboarding — ver
// src/lib/trustIdentityGate.js).
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { getOnboardingRecord, isOnboardingComplete, missingOnboardingFields } from '@/lib/trustOnboardingGate';
import { getIdentityStatus } from '@/lib/trustIdentityGate';
import { isMercadoPagoMatchRequiredForCountry } from '@/lib/mpIdentityMatchPolicy';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    const uid = ures.user.id;

    const ip = resolveClientIp(req);
    if (await enforceRateLimit(req, res, { key: `trust-onboarding-status:${uid}`, maxHits: 60, windowSeconds: 60 })) return;

    const { data: profile } = await supabase.from('users_profile').select('country_code').eq('user_id', uid).maybeSingle();
    const countryCode = profile?.country_code ?? null;

    const record = await getOnboardingRecord(uid);
    const recordWithCountry = record ? { ...record, country_code: countryCode } : null;
    const complete = isOnboardingComplete(recordWithCountry);
    // TRUST-2: identidad básica declarada (RUT para Chile) + requisito
    // de edad. `complete` arriba sigue significando exclusivamente
    // "TRUST-1 (onboarding universal) completo" — no cambia de
    // significado — `identity.creator_eligible` es el nuevo criterio
    // real que exigen los endpoints sensibles (ver trustIdentityGate.js).
    const identity = await getIdentityStatus(uid);

    let mp = null;
    if (isMercadoPagoMatchRequiredForCountry(countryCode)) {
      const { data: gw } = await supabase
        .from('merchant_gateways')
        .select('status, revoked_at, mp_identity_match, mp_identity_matched_at')
        .eq('user_id', uid)
        .eq('provider', 'mp')
        .maybeSingle();
      mp = {
        required: true,
        connected: Boolean(gw && !gw.revoked_at && gw.status === 'connected'),
        identity_match: gw?.mp_identity_match || 'not_connected',
        checked_at: gw?.mp_identity_matched_at || null,
      };
    } else {
      mp = { required: false, connected: false, identity_match: null, checked_at: null };
    }

    return res.status(200).json({
      ok: true,
      complete,
      missing: complete ? [] : missingOnboardingFields(recordWithCountry || {}),
      // Eco de los campos ya guardados, para reanudar el formulario —
      // nunca se devuelven campos de otro usuario, siempre el propio.
      fields: record
        ? {
            person_name: record.person_name || null,
            organization_name: record.organization_name || null,
            phone: record.phone || null,
            account_type: record.account_type || null,
            adult_declared: record.adult_declared === true,
            terms_version: record.terms_version || null,
            privacy_version: record.privacy_version || null,
          }
        : null,
      identity,
      mp,
      // Cierre real del onboarding — Fase 6: exactamente lo que exige
      // assertCreatorEligible, expuesto acá para que la UI sepa cuándo
      // mostrar "¡Bienvenido a Rifex!" sin adivinar.
      onboarding_complete_for_creators: complete && identity.creator_eligible,
    });
  } catch (e) {
    console.error('[api/onboarding/trust/status] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
