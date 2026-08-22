// src/pages/api/blog/[slug]/index.js
// Detalle público de un post + comentarios + estado de reacción del visitante.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const slug = String(req.query.slug || '').trim();
  if (!slug) return res.status(400).json({ ok: false, error: 'missing_slug' });

  try {
    const { data: post, error } = await supabase
      .from('blog_posts')
      .select('id, slug, category, title, excerpt, body, cover_emoji, author_name, raffle_id, stats, created_at')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (error) throw error;
    if (!post) return res.status(404).json({ ok: false, error: 'not_found' });

    const { count: reactionCount } = await supabase
      .from('blog_reactions')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', post.id);

    const { data: comments } = await supabase
      .from('blog_comments')
      .select('id, user_id, guest_name, body, created_at')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
      .limit(200);

    const userIds = [...new Set((comments || []).map((c) => c.user_id).filter(Boolean))];
    let authorsById = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('users_profile')
        .select('user_id, nombre, avatar_url')
        .in('user_id', userIds);
      authorsById = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
    }

    const outComments = (comments || []).map((c) => ({
      id: c.id,
      user_id: c.user_id,
      body: c.body,
      created_at: c.created_at,
      is_guest: !c.user_id,
      nombre: c.user_id ? (authorsById[c.user_id]?.nombre || 'Usuario') : (c.guest_name || 'Invitado'),
      avatar_url: c.user_id ? (authorsById[c.user_id]?.avatar_url || null) : null,
    }));

    let viewerReacted = false;
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (token) {
      const { data: ures } = await supabase.auth.getUser(token);
      if (ures?.user) {
        const { data: myReaction } = await supabase
          .from('blog_reactions')
          .select('post_id')
          .eq('post_id', post.id)
          .eq('user_id', ures.user.id)
          .maybeSingle();
        viewerReacted = !!myReaction;
      }
    }

    return res.status(200).json({
      ok: true,
      post: { ...post, reaction_count: reactionCount || 0 },
      comments: outComments,
      viewerReacted,
    });
  } catch (e) {
    console.error('[api/blog/:slug] GET error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
