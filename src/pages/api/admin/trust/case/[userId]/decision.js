// src/pages/api/admin/trust/case/[userId]/decision.js
// TRUST-3A — POST: registra la decisión administrativa (approve /
// request_correction / reject). La UPDATE atómica dentro de
// recordDecision (WHERE status='under_review') es lo que impide una
// doble decisión concurrente. Nunca permite que un admin decida su
// propia cuenta.
import { resolveAdmin } from '@/lib/adminAuth';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { recordDecision } from '@/lib/trustIdentityVerificationGate';
import { isValidReasonCode } from '@/lib/trustIdentityVerificationPolicy';

const ALLOWED_ACTIONS = ['approve', 'request_correction', 'reject'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const auth = await resolveAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const userId = String(req.query.userId || '');
    if (!userId) return res.status(400).json({ ok: false, error: 'missing_user_id' });

    if (await enforceRateLimit(req, res, { key: `admin-trust-case-decision:${auth.admin.id}`, maxHits: 30, windowSeconds: 60 })) return;

    const { action, reasonCode, comment, confirmedDataMatches, confirmedAgeAdult } = req.body || {};
    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({ ok: false, error: 'invalid_action' });
    }
    if (action !== 'approve' && !isValidReasonCode(action, reasonCode)) {
      return res.status(400).json({ ok: false, error: 'invalid_reason_code' });
    }

    const result = await recordDecision(userId, auth.admin.id, {
      action,
      reasonCode: action === 'approve' ? null : reasonCode,
      comment,
      confirmedDataMatches,
      confirmedAgeAdult,
    });

    if (!result.ok) {
      const status = result.reason === 'cannot_review_own_case' ? 403 : 409;
      return res.status(status).json({ ok: false, error: result.reason });
    }

    return res.status(200).json({ ok: true, status: result.case.status });
  } catch (e) {
    console.error('[api/admin/trust/case/[userId]/decision] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
