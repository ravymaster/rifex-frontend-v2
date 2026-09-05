// src/pages/api/trust/identity-verification/submit.js
// TRUST-3A — POST: envía el caso de verificación a revisión. Exige
// ambos lados del documento ya cargados — ver
// src/lib/trustIdentityVerificationGate.js, submitVerification.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { submitVerification } from '@/lib/trustIdentityVerificationGate';

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

    if (await enforceRateLimit(req, res, { key: `trust-identity-verification-submit:${uid}`, maxHits: 10, windowSeconds: 60 })) return;

    const result = await submitVerification(uid);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.reason, missing: result.missing || undefined });
    }

    return res.status(200).json({ ok: true, status: result.case.status, submitted_at: result.case.submitted_at });
  } catch (e) {
    console.error('[api/trust/identity-verification/submit] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
