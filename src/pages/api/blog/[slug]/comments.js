// src/pages/api/blog/[slug]/comments.js
// Comentarios de un post. Igual criterio que el chat de rifa: cuenta real o
// invitado con solo nombre, siempre marcado como tal.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_LEN = 500;
const MAX_GUEST_NAME_LEN = 40;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const slug = String(req.query.slug || '').trim();
  if (!slug) return res.status(400).json({ ok: false, error: 'missing_slug' });

  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ ok: false, error: 'empty_message' });
  if (body.length > MAX_LEN) return res.status(400).json({ ok: false, error: 'message_too_long' });

  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;

  let userId = null;
  let authorNombre = null;
  let authorAvatar = null;
  let guestName = null;

  if (token) {
    const { data: ures, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    userId = ures.user.id;

    const { data: profile } = await supabase
      .from('users_profile')
      .select('nombre, avatar_url')
      .eq('user_id', userId)
      .maybeSingle();
    authorNombre = profile?.nombre || 'Usuario';
    authorAvatar = profile?.avatar_url || null;
  } else {
    guestName = String(req.body?.guest_name || '').trim().slice(0, MAX_GUEST_NAME_LEN);
    if (!guestName) return res.status(400).json({ ok: false, error: 'missing_guest_name' });
    authorNombre = guestName;
  }

  try {
    const { data: post } = await supabase.from('blog_posts').select('id').eq('slug', slug).maybeSingle();
    if (!post) return res.status(404).json({ ok: false, error: 'not_found' });

    const { data: inserted, error: ierr } = await supabase
      .from('blog_comments')
      .insert({ post_id: post.id, user_id: userId, guest_name: guestName, body })
      .select('id, user_id, body, created_at')
      .single();
    if (ierr) throw ierr;

    return res.status(201).json({
      ok: true,
      comment: { ...inserted, is_guest: !userId, nombre: authorNombre, avatar_url: authorAvatar },
    });
  } catch (e) {
    console.error('[api/blog/:slug/comments] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
