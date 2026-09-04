// src/pages/api/inscripciones/[id]/check-in.js
// INSCRIPCIONES V1 — único punto de entrada que puede ejecutar check-in.
// Adaptado de /api/events/[id]/check-in.js: mismo GET-ping/POST-execute,
// misma autoridad atómica real (la RPC), mismo criterio SCAN != CHECK-IN.
//
// V1 es owner-only (decisión documentada, sección 20 del mandato: sin
// event_staff-equivalente todavía) — "authorized" simplemente es
// user.id === activity.organizer_id, verificado tanto acá (UX) como,
// de forma real e inescapable, dentro de check_in_registration_participant
// (SQL). Nunca acepta desde el cliente resultado/timestamp/checked_in_by
// — todo eso lo decide y devuelve la RPC.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/rateLimit';

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

async function fetchAttendance(activityId, capacity) {
  const { count, error } = await supabase
    .from('registration_participants')
    .select('id', { count: 'exact', head: true })
    .eq('activity_id', activityId)
    .not('checked_in_at', 'is', null);
  if (error) throw error;
  return { checked_in: count || 0, capacity };
}

const ERROR_STATUS = {
  missing_actor: 401,
  missing_activity: 400,
  invalid_token: 400,
  participant_not_found: 404,
  wrong_activity: 409,
  activity_not_found: 404,
  not_authorized: 403,
  already_used: 409,
};

export default async function handler(req, res) {
  const { id: activityId } = req.query || {};
  if (!activityId) return res.status(400).json({ ok: false, error: 'missing_activity_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    if (req.method === 'GET') {
      if (await enforceRateLimit(req, res, { key: `inscripciones-checkin-ping:${user.id}:${activityId}`, maxHits: 60, windowSeconds: 60 })) return;

      const { data: activity, error: actErr } = await supabase
        .from('registration_activities')
        .select('id, title, status, organizer_id, capacity')
        .eq('id', activityId)
        .maybeSingle();
      if (actErr) throw actErr;
      if (!activity) return res.status(404).json({ ok: false, error: 'not_found' });

      const authorized = activity.organizer_id === user.id;
      const attendance = authorized ? await fetchAttendance(activityId, activity.capacity) : null;
      return res.status(200).json({
        ok: true,
        authorized,
        activity: { id: activity.id, title: activity.title, status: activity.status },
        attendance,
      });
    }

    if (req.method === 'POST') {
      if (await enforceRateLimit(req, res, { key: `inscripciones-checkin:${user.id}:${activityId}`, maxHits: 180, windowSeconds: 60 })) return;

      const body = req.body || {};
      const qrToken = typeof body.qr_token === 'string' ? body.qr_token.trim() : null;
      if (!qrToken || qrToken.length < 16 || qrToken.length > 200) {
        return res.status(400).json({ ok: false, error: 'invalid_token' });
      }

      const { data: rpcResult, error: rpcErr } = await supabase.rpc('check_in_registration_participant', {
        p_qr_token: qrToken,
        p_actor_user_id: user.id,
        p_activity_id: activityId,
      });
      if (rpcErr) throw rpcErr;

      const { data: capacityRow } = await supabase
        .from('registration_activities')
        .select('capacity')
        .eq('id', activityId)
        .maybeSingle();
      const attendance = await fetchAttendance(activityId, capacityRow?.capacity ?? null);

      if (!rpcResult?.ok) {
        const status = ERROR_STATUS[rpcResult?.error] || 400;
        return res.status(status).json({ ...rpcResult, attendance });
      }
      return res.status(200).json({ ...rpcResult, attendance });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[api/inscripciones/[id]/check-in] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
