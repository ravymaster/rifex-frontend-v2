// src/pages/api/blog/historia.js
// Un creador convierte una de sus propias rifas ya cerradas en una historia
// de éxito. Los números vendidos y el monto recaudado salen de payments
// reales — el creador solo escribe el relato y el título.
import { createClient } from '@supabase/supabase-js';
import { slugify } from '@/lib/slugify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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
  const uid = ures.user.id;

  const raffleId = String(req.body?.raffle_id || '').trim();
  const title = String(req.body?.title || '').trim().slice(0, 140);
  const story = String(req.body?.story || '').trim().slice(0, 3000);
  const coverEmoji = String(req.body?.cover_emoji || '🏆').trim().slice(0, 8);

  if (!raffleId) return res.status(400).json({ ok: false, error: 'missing_raffle_id' });
  if (!title) return res.status(400).json({ ok: false, error: 'missing_title' });
  if (story.length < 20) return res.status(400).json({ ok: false, error: 'story_too_short' });

  try {
    const { data: raffle } = await supabase
      .from('raffles')
      .select('id, title, creator_id, status, price_cents, total_numbers')
      .eq('id', raffleId)
      .maybeSingle();
    if (!raffle) return res.status(404).json({ ok: false, error: 'raffle_not_found' });
    if (raffle.creator_id !== uid) return res.status(403).json({ ok: false, error: 'not_your_raffle' });
    if (raffle.status !== 'closed') return res.status(400).json({ ok: false, error: 'raffle_not_closed' });

    const { data: dupe } = await supabase
      .from('blog_posts')
      .select('id, slug')
      .eq('raffle_id', raffleId)
      .eq('category', 'historia')
      .maybeSingle();
    if (dupe) return res.status(409).json({ ok: false, error: 'already_shared', slug: dupe.slug });

    const { data: payments } = await supabase
      .from('payments')
      .select('amount_cents, numbers')
      .eq('raffle_id', raffleId)
      .eq('status', 'approved');
    const amountCents = (payments || []).reduce((sum, p) => sum + (p.amount_cents || 0), 0);
    const numbersSold = (payments || []).reduce((sum, p) => sum + (Array.isArray(p.numbers) ? p.numbers.length : 0), 0);

    const { data: profile } = await supabase
      .from('users_profile')
      .select('nombre')
      .eq('user_id', uid)
      .maybeSingle();

    const { data: inserted, error } = await insertWithUniqueSlug(slugify(title), {
      category: 'historia',
      title,
      excerpt: story.slice(0, 200),
      body: story,
      cover_emoji: coverEmoji,
      author_user_id: uid,
      author_name: profile?.nombre || 'Creador de Rifex',
      raffle_id: raffleId,
      stats: {
        numbers_sold: numbersSold,
        total_numbers: raffle.total_numbers,
        amount_cents: amountCents,
        price_cents: raffle.price_cents,
      },
      status: 'published',
    });
    if (error) throw error;

    return res.status(201).json({ ok: true, post: inserted });
  } catch (e) {
    console.error('[api/blog/historia] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
}
