// src/pages/api/events/[id]/staff/[staffId].js
// EVENT-4 — revocar/reactivar un colaborador. Owner-only. Nunca DELETE
// ("no RBAC empresarial", pero sí mismo criterio de auditabilidad que el
// resto de Eventos: void_event_ticket tampoco borra) — revocar es un
// cambio de status, preserva historial.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { assertOnboardingComplete } from '@/lib/trustOnboardingGate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function getRequester(req) {
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return null;
  const { data: ures, error } = await supabase.auth.getUser(token);
  if (error || !ures?.user) return null;
  return ures.user;
}

export default async function handler(req, res) {
  const { id: eventId, staffId } = req.query || {};
  if (!eventId || !staffId) return res.status(400).json({ ok: false, error: 'missing_id' });

  if (req.method !== 'PATCH') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const ip = resolveClientIp(req);
    if (await enforceRateLimit(req, res, { key: `events-staff-patch:${user.id}:${eventId}`, maxHits: 30, windowSeconds: 60 })) return;

    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('id, organizer_id')
      .eq('id', eventId)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!event) return res.status(404).json({ ok: false, error: 'not_found' });
    if (event.organizer_id !== user.id) return res.status(403).json({ ok: false, error: 'not_your_event' });

    const body = req.body || {};
    const status = body.status;
    if (status !== 'active' && status !== 'revoked') {
      return res.status(400).json({ ok: false, error: 'invalid_status' });
    }

    // TRUST-1: reactivar staff otorga acceso — exige onboarding completo.
    // Revocar reduce riesgo, mismo criterio que rifas/delete.js — nunca
    // se bloquea.
    if (status === 'active') {
      const onboarding = await assertOnboardingComplete(user.id);
      if (!onboarding.ok) return res.status(403).json({ ok: false, error: onboarding.reason, message: onboarding.message });
    }

    const { data: updated, error: updErr } = await supabase
      .from('event_staff')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', staffId)
      .eq('event_id', eventId)
      .select('*')
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) return res.status(404).json({ ok: false, error: 'staff_not_found' });

    return res.status(200).json({ ok: true, staff: updated });
  } catch (e) {
    console.error('[api/events/[id]/staff/[staffId]] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
