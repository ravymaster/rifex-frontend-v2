// src/pages/api/onboarding/trust/status.js
// TRUST-1 — GET: estado real del onboarding universal del usuario
// autenticado. Nunca expone datos de otro usuario (siempre acotado por
// el id resuelto desde el token, nunca desde query/body). Usado tanto
// por /registro/continuar (para prellenar y mostrar progreso) como por
// el chequeo de redirect client-side (src/lib/trustOnboardingClient.js).
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { getOnboardingRecord, isOnboardingComplete, missingOnboardingFields } from '@/lib/trustOnboardingGate';
import { getIdentityStatus } from '@/lib/trustIdentityGate';

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

    const record = await getOnboardingRecord(uid);
    const complete = isOnboardingComplete(record);
    // TRUST-2: identidad básica declarada (RUT para Chile) + requisito
    // de edad. `complete` arriba sigue significando exclusivamente
    // "TRUST-1 (onboarding universal) completo" — no cambia de
    // significado — `identity.creator_eligible` es el nuevo criterio
    // real que exigen los endpoints sensibles (ver trustIdentityGate.js).
    const identity = await getIdentityStatus(uid);

    return res.status(200).json({
      ok: true,
      complete,
      missing: complete ? [] : missingOnboardingFields(record || {}),
      // Eco de los campos ya guardados, para reanudar el formulario —
      // nunca se devuelven campos de otro usuario, siempre el propio.
      fields: record
        ? {
            legal_name: record.legal_name || null,
            birth_date: record.birth_date || null,
            phone: record.phone || null,
            account_type: record.account_type || null,
            terms_version: record.terms_version || null,
            privacy_version: record.privacy_version || null,
          }
        : null,
      identity,
    });
  } catch (e) {
    console.error('[api/onboarding/trust/status] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
