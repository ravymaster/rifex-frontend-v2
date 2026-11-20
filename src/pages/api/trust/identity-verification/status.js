// src/pages/api/trust/identity-verification/status.js
// TRUST-3A — GET: estado real de la verificación documental del usuario
// autenticado. Nunca expone storage_key, hash, ni datos de otro usuario.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { getVerificationCase, listUserDocuments } from '@/lib/trustIdentityVerificationGate';
import { accountTypeSupportsVerification } from '@/lib/trustIdentityVerificationPolicy';

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

    if (await enforceRateLimit(req, res, { key: `trust-identity-verification-status:${uid}`, maxHits: 60, windowSeconds: 60 })) return;

    const { data: onboarding } = await supabase
      .from('trust_onboarding')
      .select('account_type, identity_verified, age_verified, identity_verification_expires_at')
      .eq('user_id', uid)
      .maybeSingle();

    if (!accountTypeSupportsVerification(onboarding?.account_type)) {
      return res.status(200).json({
        ok: true,
        supported: false,
        message: 'Verificación de organizaciones próximamente.',
      });
    }

    const verificationCase = await getVerificationCase(uid);
    const documents = verificationCase ? await listUserDocuments(uid) : [];

    return res.status(200).json({
      ok: true,
      supported: true,
      status: verificationCase?.status || 'not_started',
      reason_code: verificationCase?.reason_code || null,
      submitted_at: verificationCase?.submitted_at || null,
      reviewed_at: verificationCase?.reviewed_at || null,
      expires_at: verificationCase?.expires_at || null,
      documents: documents.map((d) => ({ side: d.side, uploaded_at: d.created_at })),
      identity_verified: Boolean(onboarding?.identity_verified),
      age_verified: Boolean(onboarding?.age_verified),
    });
  } catch (e) {
    console.error('[api/trust/identity-verification/status] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
