// src/pages/api/blog/index.js
// RIFEX BLOG PRIVATE PRE-PROD — el listado ya no es público: requiere el
// mismo Bearer token que historia.js/react.js ya exigían para escribir.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const CATEGORIES = ['historia', 'guia', 'consejo', 'novedad'];
const DEFAULT_LIMIT = 12;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });
  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

  const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), 30);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  try {
    let q = supabase
      .from('blog_posts')
      .select('id, slug, category, title, excerpt, cover_emoji, author_name, raffle_id, stats, created_at, blog_reactions(count), blog_comments(count)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (category) q = q.eq('category', category);
    const { data: rows, error } = await q;
    if (error) throw error;

    const posts = (rows || []).map((p) => ({
      id: p.id,
      slug: p.slug,
      category: p.category,
      title: p.title,
      excerpt: p.excerpt,
      cover_emoji: p.cover_emoji,
      author_name: p.author_name,
      raffle_id: p.raffle_id,
      stats: p.stats,
      created_at: p.created_at,
      reaction_count: p.blog_reactions?.[0]?.count || 0,
      comment_count: p.blog_comments?.[0]?.count || 0,
    }));

    let categoryCounts = null;
    let featured = null;
    if (offset === 0) {
      const counts = await Promise.all(
        CATEGORIES.map((c) =>
          supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('category', c)
        )
      );
      categoryCounts = Object.fromEntries(CATEGORIES.map((c, i) => [c, counts[i].count || 0]));

      const { data: topRows } = await supabase
        .from('blog_posts')
        .select('id, slug, title, cover_emoji, blog_reactions(count)')
        .eq('status', 'published')
        .limit(30);
      featured = (topRows || [])
        .map((p) => ({ id: p.id, slug: p.slug, title: p.title, cover_emoji: p.cover_emoji, reaction_count: p.blog_reactions?.[0]?.count || 0 }))
        .sort((a, b) => b.reaction_count - a.reaction_count)
        .slice(0, 3);
    }

    return res.status(200).json({ ok: true, posts, categoryCounts, topReacted: featured, hasMore: posts.length === limit });
  } catch (e) {
    console.error('[api/blog] GET error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
