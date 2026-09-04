// src/pages/api/inscripciones/[id]/publish.js
// INSCRIPCIONES V1 — transición explícita draft -> active. Owner-only.
// Nunca implícita en el PATCH general (mismo criterio que
// /api/events/[id]/publish.js): publicar es una acción de producto con
// semántica propia, no un campo más a editar.
import { createClient } from '@supabase/supabase-js';

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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: activity, error: fetchErr } = await supabase
      .from('registration_activities')
      .select('id, organizer_id, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!activity) return res.status(404).json({ ok: false, error: 'not_found' });
    if (activity.organizer_id !== user.id) return res.status(403).json({ ok: false, error: 'not_your_activity' });

    if (activity.status !== 'draft') {
      return res.status(409).json({ ok: false, error: 'invalid_status_transition' });
    }

    const { data: updated, error: updErr } = await supabase
      .from('registration_activities')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (updErr) throw updErr;

    return res.status(200).json({ ok: true, activity: updated });
  } catch (e) {
    console.error('[api/inscripciones/[id]/publish] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
