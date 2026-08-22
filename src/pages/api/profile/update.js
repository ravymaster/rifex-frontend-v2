// src/pages/api/profile/update.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_BIO_LEN = 280;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    const uid = ures.user.id;

    const { nombre, bio } = req.body || {};
    const row = { user_id: uid };
    if (typeof nombre === 'string') row.nombre = nombre.trim().slice(0, 80) || null;
    if (typeof bio === 'string') row.bio = bio.trim().slice(0, MAX_BIO_LEN) || null;

    const { error: dbErr } = await supabase
      .from('users_profile')
      .upsert(row, { onConflict: 'user_id' });
    if (dbErr) throw dbErr;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/profile/update] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
