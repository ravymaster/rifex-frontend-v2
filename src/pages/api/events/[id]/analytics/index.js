// src/pages/api/events/[id]/analytics/index.js
// EVENT-5 — resumen JSON de analytics del evento, para el dashboard del
// panel. Organizer-only (canViewEventAnalytics — nunca door/staff, nunca
// RLS pública). Un evento cancelado sigue siendo consultable acá (nunca
// bloqueado por status).
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, resolveClientIp } from '@/lib/rateLimit';
import { canViewEventAnalytics } from '@/lib/eventAnalyticsAuth';
import { fetchEventAnalyticsData, computeEventAnalyticsSummary } from '@/lib/eventAnalytics';

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
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id: eventId } = req.query || {};
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_event_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const ip = resolveClientIp(req);
    if (await enforceRateLimit(req, res, { key: `events-analytics:${user.id}:${eventId}`, maxHits: 30, windowSeconds: 60 })) return;

    const authorized = await canViewEventAnalytics(supabase, eventId, user.id);
    if (!authorized) return res.status(403).json({ ok: false, error: 'not_authorized' });

    const data = await fetchEventAnalyticsData(supabase, eventId);
    if (!data) return res.status(404).json({ ok: false, error: 'not_found' });

    const summary = computeEventAnalyticsSummary(data);
    return res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[api/events/[id]/analytics] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
