// src/pages/api/admin/trust/queue.js
// TRUST-3A — GET: cola de revisión (solo casos submitted/under_review,
// más antiguos primero). Gate real: resolveAdmin (app_metadata.role ===
// 'admin'), mismo criterio que el resto de src/pages/api/admin/*.js.
// Nunca expone más que lo necesario para priorizar y abrir un caso —
// el detalle completo (datos declarados + evidencia) solo aparece en
// GET /api/admin/trust/case/[userId].
import { resolveAdmin } from '@/lib/adminAuth';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { listReviewQueue } from '@/lib/trustIdentityVerificationGate';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const auth = await resolveAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    if (await enforceRateLimit(req, res, { key: `admin-trust-queue:${auth.admin.id}`, maxHits: 60, windowSeconds: 60 })) return;

    const items = await listReviewQueue({ limit: 50 });
    return res.status(200).json({ ok: true, items });
  } catch (e) {
    console.error('[api/admin/trust/queue] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
