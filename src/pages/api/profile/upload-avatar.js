// src/pages/api/profile/upload-avatar.js
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BUCKET = 'avatars';
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

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

    const { filename, contentType, dataBase64 } = req.body || {};
    if (!filename || !contentType || !dataBase64) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return res.status(400).json({ ok: false, error: 'invalid_type' });
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ ok: false, error: 'file_too_large' });
    }

    const uid = ures.user.id;
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = `${uid}/${randomUUID()}-${safeName}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { error: dbErr } = await supabase
      .from('users_profile')
      .upsert({ user_id: uid, avatar_url: pub.publicUrl }, { onConflict: 'user_id' });
    if (dbErr) throw dbErr;

    return res.status(200).json({ ok: true, url: pub.publicUrl });
  } catch (e) {
    console.error('[api/profile/upload-avatar] error', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
