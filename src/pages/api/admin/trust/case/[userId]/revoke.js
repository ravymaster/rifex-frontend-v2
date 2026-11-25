// src/pages/api/admin/trust/case/[userId]/revoke.js
// TRUST-3A — POST: revoca una verificación previamente aprobada (por
// ejemplo, fraude descubierto después de aprobar). Limpia
// identity_verified/age_verified — nunca toca pagos ni iniciativas.
import { resolveAdmin } from '@/lib/adminAuth';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { revokeVerification } from '@/lib/trustIdentityVerificationGate';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const auth = await resolveAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const userId = String(req.query.userId || '');
    if (!userId) return res.status(400).json({ ok: false, error: 'missing_user_id' });

    if (await enforceRateLimit(req, res, { key: `admin-trust-case-revoke:${auth.admin.id}`, maxHits: 10, windowSeconds: 60 })) return;

    const { reasonCode, comment } = req.body || {};
    const result = await revokeVerification(userId, auth.admin.id, { reasonCode, comment });
    if (!result.ok) {
      const status = result.reason === 'cannot_review_own_case' ? 403 : 409;
      return res.status(status).json({ ok: false, error: result.reason });
    }

    return res.status(200).json({ ok: true, status: result.case.status });
  } catch (e) {
    console.error('[api/admin/trust/case/[userId]/revoke] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
