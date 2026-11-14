// src/pages/api/medidor-qr/quota.js
// MEDIDOR QR V1 — FREE QUOTA ADJUSTMENT (2026-09-09): consulta de
// solo lectura del cupo mensual del organizador autenticado — "3 de
// 10 utilizados", nunca solo un mensaje binario al chocar con el
// límite. Cuenta directamente medidor_qr_free_usage (mismo período
// que usa create_medidor_qr, mismo currentFreePeriodKey) — nunca
// vuelve a calcular ni duplica la autoridad real de la cuota, que
// sigue siendo exclusivamente la RPC en el momento de crear.
import { createClient } from '@supabase/supabase-js';
import { currentFreePeriodKey, nextFreePeriodStartsAt } from '@/lib/registrationFreeQuota';
import { MEDIDOR_QR_FREE_QUOTA_LIMIT } from '@/lib/medidorQrQuota';

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
    const { data: ures, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !ures?.user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const periodKey = currentFreePeriodKey(new Date());
    const { count, error: countErr } = await supabase
      .from('medidor_qr_free_usage')
      .select('id', { count: 'exact', head: true })
      .eq('organizer_id', ures.user.id)
      .eq('period_key', periodKey);
    if (countErr) throw countErr;

    const used = count || 0;
    return res.status(200).json({
      ok: true,
      used,
      limit: MEDIDOR_QR_FREE_QUOTA_LIMIT,
      remaining: Math.max(0, MEDIDOR_QR_FREE_QUOTA_LIMIT - used),
      period_key: periodKey,
      next_available_at: nextFreePeriodStartsAt(new Date()).toISOString(),
    });
  } catch (e) {
    console.error('[api/medidor-qr/quota] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
