// src/pages/api/blog/[slug]/react.js
// Toggle de "me gusta". Requiere sesión real (evita spam de un mismo botón).
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const slug = String(req.query.slug || '').trim();
  if (!slug) return res.status(400).json({ ok: false, error: 'missing_slug' });

  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

  try {
    const { data: post } = await supabase.from('blog_posts').select('id').eq('slug', slug).maybeSingle();
    if (!post) return res.status(404).json({ ok: false, error: 'not_found' });

    const { data: existing } = await supabase
      .from('blog_reactions')
      .select('post_id')
      .eq('post_id', post.id)
      .eq('user_id', ures.user.id)
      .maybeSingle();

    let reacted;
    if (existing) {
      const { error: delErr } = await supabase.from('blog_reactions').delete().eq('post_id', post.id).eq('user_id', ures.user.id);
      if (delErr) throw delErr;
      reacted = false;
    } else {
      const { error: insErr } = await supabase.from('blog_reactions').insert({ post_id: post.id, user_id: ures.user.id });
      if (insErr) throw insErr;
      reacted = true;
    }

    const { count } = await supabase.from('blog_reactions').select('post_id', { count: 'exact', head: true }).eq('post_id', post.id);

    return res.status(200).json({ ok: true, reacted, reaction_count: count || 0 });
  } catch (e) {
    console.error('[api/blog/:slug/react] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
