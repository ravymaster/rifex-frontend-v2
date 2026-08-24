// src/pages/api/events/mine.js
// EVENT-1 — eventos del usuario autenticado (cualquier status), para
// /panel/eventos. Identidad SIEMPRE de auth.getUser(token).
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

    const { data, error } = await supabase
      .from('events')
      .select('id, title, cover_image_url, starts_at, ends_at, status, created_at')
      .eq('organizer_id', ures.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return res.status(200).json({ ok: true, items: data || [] });
  } catch (e) {
    console.error('[api/events/mine] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
