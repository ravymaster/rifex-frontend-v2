// src/pages/api/inscripciones/[id]/export.js
// INSCRIPCIONES V1 — export XLSX de participantes. Owner-only. Genera el
// buffer completo en memoria (sin escritura a disco, compatible con
// Vercel serverless) — mismo patrón que
// /api/events/[id]/analytics/export.js. FREE tope 50 participantes, muy
// por debajo de cualquier límite de rendimiento real — sin necesidad de
// un checkAnalyticsLimits equivalente en V1.
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/rateLimit';
import { sanitizeFilename } from '@/lib/eventAnalytics';
import { buildRegistrationParticipantsWorkbook } from '@/lib/registrationAnalyticsWorkbook';

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

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    if (await enforceRateLimit(req, res, { key: `inscripciones-export:${user.id}:${id}`, maxHits: 6, windowSeconds: 60 })) return;

    const { data: activity, error: actErr } = await supabase
      .from('registration_activities')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (actErr) throw actErr;
    if (!activity) return res.status(404).json({ ok: false, error: 'not_found' });
    if (activity.organizer_id !== user.id) return res.status(403).json({ ok: false, error: 'not_your_activity' });

    const { data: participants, error } = await supabase
      .from('registration_participants')
      .select('full_name, email, phone, registered_at, checked_in_at')
      .eq('activity_id', id)
      .order('registered_at', { ascending: true });
    if (error) throw error;

    const workbook = buildRegistrationParticipantsWorkbook({ activity, participants: participants || [] });
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `rifex-${sanitizeFilename(activity.title)}-inscritos.xlsx`.replace(/\s+/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    console.error('[api/inscripciones/[id]/export] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
