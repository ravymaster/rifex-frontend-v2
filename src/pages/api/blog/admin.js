// src/pages/api/blog/admin.js
// Posts del equipo (Guía/Consejo/Novedad). Gateado por email, mismo criterio
// que ya usa reconcile-payments.js — no hay rol de admin real en la DB todavía.
import { createClient } from '@supabase/supabase-js';
import { slugify } from '@/lib/slugify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const ALLOWED_CATEGORIES = ['guia', 'consejo', 'novedad'];

async function insertWithUniqueSlug(baseSlug, row) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase.from('blog_posts').insert({ ...row, slug }).select().single();
    if (!error) return { data, error: null };
    if (error.code !== '23505') return { data: null, error };
  }
  return { data: null, error: new Error('slug_conflict') };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' });

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return res.status(401).json({ ok: false, error: 'invalid_auth' });

  const email = (ures.user.email || '').toLowerCase();
  if (!ADMIN_EMAILS.length || !ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ ok: false, error: 'not_admin' });
  }

  const category = String(req.body?.category || '').trim();
  const title = String(req.body?.title || '').trim().slice(0, 140);
  const excerpt = String(req.body?.excerpt || '').trim().slice(0, 220);
  const body = String(req.body?.body || '').trim();
  const coverEmoji = String(req.body?.cover_emoji || '📰').trim().slice(0, 8);

  if (!ALLOWED_CATEGORIES.includes(category)) return res.status(400).json({ ok: false, error: 'invalid_category' });
  if (!title) return res.status(400).json({ ok: false, error: 'missing_title' });
  if (body.length < 20) return res.status(400).json({ ok: false, error: 'body_too_short' });

  try {
    const { data: inserted, error } = await insertWithUniqueSlug(slugify(title), {
      category,
      title,
      excerpt: excerpt || body.slice(0, 200),
      body,
      cover_emoji: coverEmoji,
      author_user_id: ures.user.id,
      author_name: 'Equipo Rifex',
      raffle_id: null,
      stats: null,
      status: 'published',
    });
    if (error) throw error;

    return res.status(201).json({ ok: true, post: inserted });
  } catch (e) {
    console.error('[api/blog/admin] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
