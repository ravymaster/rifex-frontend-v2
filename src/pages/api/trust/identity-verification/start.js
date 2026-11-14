// src/pages/api/trust/identity-verification/start.js
// TRUST-3A — POST: inicia (o devuelve, si ya existe) el caso de
// verificación del usuario autenticado. Rechaza cuentas de organización
// — ver docs/trust/TRUST_AGE_IDENTITY_VERIFICATION.md, TRUST-3A.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { startVerification } from '@/lib/trustIdentityVerificationGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    const uid = ures.user.id;

    if (await enforceRateLimit(req, res, { key: `trust-identity-verification-start:${uid}`, maxHits: 10, windowSeconds: 60 })) return;

    // account_type vive en trust_onboarding (TRUST-1); country_code vive
    // en users_profile — nunca en trust_onboarding, esa tabla no tiene
    // esa columna (bug real encontrado adversarialmente: seleccionarla
    // de ahí hacía fallar la consulta y accountType quedaba undefined,
    // rechazando a TODA persona natural como si fuera organización).
    const { data: onboarding, error: onboardingErr } = await supabase
      .from('trust_onboarding')
      .select('account_type')
      .eq('user_id', uid)
      .maybeSingle();
    if (onboardingErr) {
      console.error('[api/trust/identity-verification/start] error leyendo onboarding', onboardingErr.message);
      return res.status(500).json({ ok: false, error: 'onboarding_check_failed' });
    }

    const { data: profile } = await supabase.from('users_profile').select('country_code').eq('user_id', uid).maybeSingle();

    const result = await startVerification(uid, {
      accountType: onboarding?.account_type,
      countryCode: profile?.country_code ?? null,
    });

    if (!result.ok) {
      return res.status(200).json({ ok: true, supported: false, message: 'Verificación de organizaciones próximamente.' });
    }

    return res.status(200).json({ ok: true, supported: true, status: result.case.status });
  } catch (e) {
    console.error('[api/trust/identity-verification/start] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
