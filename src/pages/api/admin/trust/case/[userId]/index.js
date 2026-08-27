// src/pages/api/admin/trust/case/[userId]/index.js
// TRUST-3A — GET: abre un caso para revisión (reclama atómicamente si
// estaba 'submitted'). Devuelve los datos declarados (nombre legal,
// fecha de nacimiento, RUT) y URLs firmadas de corta duración (120s)
// para ver la evidencia — generadas recién en esta llamada, nunca
// persistidas. Gate real: resolveAdmin.
import { resolveAdmin } from '@/lib/adminAuth';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { openCaseForReview } from '@/lib/trustIdentityVerificationGate';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const auth = await resolveAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const userId = String(req.query.userId || '');
    if (!userId) return res.status(400).json({ ok: false, error: 'missing_user_id' });

    if (await enforceRateLimit(req, res, { key: `admin-trust-case-open:${auth.admin.id}`, maxHits: 60, windowSeconds: 60 })) return;

    const result = await openCaseForReview(userId, auth.admin.id);
    if (!result.ok) {
      return res.status(404).json({ ok: false, error: result.reason });
    }

    return res.status(200).json({
      ok: true,
      case: result.case,
      declared: result.declared,
      evidence: result.evidence,
    });
  } catch (e) {
    console.error('[api/admin/trust/case/[userId]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
