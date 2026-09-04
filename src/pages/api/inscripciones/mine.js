// src/pages/api/inscripciones/mine.js
// INSCRIPCIONES V1 — listado privado del organizador autenticado (todas
// sus actividades, cualquier status). Acotado SIEMPRE por
// organizer_id = user.id resuelto server-side — nunca un id que mande
// el cliente (mismo criterio de ownership que /api/panel/eventos).
// Incluye contadores derivados (registered/checked_in) para que
// Mis Iniciativas y el panel puedan mostrarlos sin una segunda ronda de
// requests por actividad.
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
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const user = await getRequester(req);
    if (!user) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: activities, error } = await supabase
      .from('registration_activities')
      .select('id, title, starts_at, status, plan, capacity, created_at')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = (activities || []).map((a) => a.id);
    let registeredById = new Map();
    let checkedInById = new Map();

    if (ids.length > 0) {
      const { data: participants, error: pErr } = await supabase
        .from('registration_participants')
        .select('activity_id, checked_in_at')
        .in('activity_id', ids);
      if (pErr) throw pErr;
      for (const p of participants || []) {
        registeredById.set(p.activity_id, (registeredById.get(p.activity_id) || 0) + 1);
        if (p.checked_in_at) checkedInById.set(p.activity_id, (checkedInById.get(p.activity_id) || 0) + 1);
      }
    }

    const items = (activities || []).map((a) => ({
      ...a,
      registered_count: registeredById.get(a.id) || 0,
      checked_in_count: checkedInById.get(a.id) || 0,
    }));

    return res.status(200).json({ ok: true, items });
  } catch (e) {
    console.error('[api/inscripciones/mine] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
